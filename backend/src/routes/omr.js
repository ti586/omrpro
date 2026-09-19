// src/routes/omr.js
import { Router } from 'express';
import multer from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { db } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { omrQueue } from '../workers/index.js';

const router = Router();
router.use(authenticate);

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/app/uploads';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname) || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter: (_req, file, cb) => {
    if (/image\/(jpeg|png|tiff|bmp|webp)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens são aceitas (JPG, PNG, TIFF, BMP).'));
  },
});

// ── POST /api/v1/omr/upload — single card ───────────────────
router.post('/upload', upload.single('image'), async (req, res, next) => {
  try {
    const { examId, cardId } = req.body;
    if (!examId) return res.status(400).json({ error: 'examId é obrigatório.' });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    // Upsert card record
    let targetCardId = cardId;
    if (!targetCardId) {
      const { rows: [card] } = await db.query(
        `INSERT INTO answer_cards (exam_id, image_path, image_original, status, uploaded_at)
         VALUES ($1, $2, $3, 'pending', NOW()) RETURNING id`,
        [examId, req.file.path, req.file.originalname],
      );
      targetCardId = card.id;
    } else {
      await db.query(
        `UPDATE answer_cards SET image_path=$1, image_original=$2,
         status='pending', uploaded_at=NOW() WHERE id=$3`,
        [req.file.path, req.file.originalname, cardId],
      );
    }

    // Enqueue OMR job
    const job = await omrQueue.add(
      'process-card',
      { cardId: targetCardId, examId, imagePath: req.file.path },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    res.status(202).json({ cardId: targetCardId, jobId: job.id, status: 'queued' });
  } catch (err) { next(err); }
});

// ── POST /api/v1/omr/upload-batch — multiple cards ──────────
router.post('/upload-batch', upload.array('images', 200), async (req, res, next) => {
  try {
    const { examId } = req.body;
    if (!examId) return res.status(400).json({ error: 'examId é obrigatório.' });
    if (!req.files?.length) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    const cards = [];

    for (const file of req.files) {
      const { rows: [card] } = await db.query(
        `INSERT INTO answer_cards (exam_id, image_path, image_original, status, uploaded_at)
         VALUES ($1, $2, $3, 'pending', NOW()) RETURNING id`,
        [examId, file.path, file.originalname],
      );

      await omrQueue.add(
        'process-card',
        { cardId: card.id, examId, imagePath: file.path },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );

      cards.push({ id: card.id, fileName: file.originalname, status: 'queued' });
    }

    res.status(202).json({ cards, total: cards.length });
  } catch (err) { next(err); }
});

// ── GET /api/v1/omr/status/:jobId ───────────────────────────
router.get('/status/:jobId', async (req, res, next) => {
  try {
    const job = await omrQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job não encontrado.' });

    const state = await job.getState();
    res.json({
      jobId:    job.id,
      state,
      progress: job.progress,
      result:   state === 'completed' ? job.returnvalue : null,
      error:    state === 'failed'    ? job.failedReason : null,
    });
  } catch (err) { next(err); }
});

// ── GET /api/v1/omr/queue-stats ─────────────────────────────
router.get('/queue-stats', async (_req, res, next) => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      omrQueue.getWaitingCount(),
      omrQueue.getActiveCount(),
      omrQueue.getCompletedCount(),
      omrQueue.getFailedCount(),
    ]);
    res.json({ waiting, active, completed, failed });
  } catch (err) { next(err); }
});

export default router;
