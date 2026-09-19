// src/routes/exams.js
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { db } from '../db/pool.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import { generateCardPDF } from '../services/pdfService.js';
import { generateQRCode } from '../services/qrService.js';

const router = Router();
router.use(authenticate);

// ── GET /api/v1/exams ────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.schoolId];
    let where = 'e.school_id = $1';
    if (status) { where += ` AND e.status = $2`; params.push(status); }

    const { rows: exams } = await db.query(
      `SELECT e.*,
              s.name AS subject_name,
              u.name AS created_by_name,
              COUNT(DISTINCT q.id)::int AS question_count,
              COUNT(DISTINCT ac.id)::int AS card_count,
              COUNT(DISTINCT ac.id) FILTER (WHERE ac.status = 'graded')::int AS graded_count,
              AVG(ac.total_score) FILTER (WHERE ac.status = 'graded') AS avg_score,
              json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name))
                FILTER (WHERE c.id IS NOT NULL) AS classes
       FROM exams e
       LEFT JOIN subjects s ON s.id = e.subject_id
       LEFT JOIN users u ON u.id = e.created_by
       LEFT JOIN questions q ON q.exam_id = e.id
       LEFT JOIN answer_cards ac ON ac.exam_id = e.id
       LEFT JOIN exam_classes ec ON ec.exam_id = e.id
       LEFT JOIN classes c ON c.id = ec.class_id
       WHERE ${where}
       GROUP BY e.id, s.name, u.name
       ORDER BY e.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    const { rows: [{ count }] } = await db.query(
      `SELECT COUNT(*)::int FROM exams e WHERE ${where}`, params
    );

    res.json({ exams, pagination: { total: count, page: +page, limit: +limit } });
  } catch (err) { next(err); }
});

// ── GET /api/v1/exams/:id ────────────────────────────────────
router.get('/:id', param('id').isUUID(), async (req, res, next) => {
  try {
    const { rows: [exam] } = await db.query(
      `SELECT e.*,
              s.name AS subject_name,
              u.name AS created_by_name,
              json_agg(DISTINCT jsonb_build_object(
                'id', q.id, 'number', q.number, 'type', q.type,
                'correct_answer', q.correct_answer, 'score', q.score,
                'is_nullified', q.is_nullified
              ) ORDER BY q.number) FILTER (WHERE q.id IS NOT NULL) AS questions,
              json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name))
                FILTER (WHERE c.id IS NOT NULL) AS classes,
              (SELECT row_to_json(st) FROM (
                SELECT graded_count, avg_score, pass_count, fail_count
                FROM exam_statistics WHERE exam_id = e.id AND class_id IS NULL
                LIMIT 1
              ) st) AS stats
       FROM exams e
       LEFT JOIN subjects s ON s.id = e.subject_id
       LEFT JOIN users u ON u.id = e.created_by
       LEFT JOIN questions q ON q.exam_id = e.id
       LEFT JOIN exam_classes ec ON ec.exam_id = e.id
       LEFT JOIN classes c ON c.id = ec.class_id
       WHERE e.id = $1 AND e.school_id = $2
       GROUP BY e.id, s.name, u.name`,
      [req.params.id, req.user.schoolId],
    );
    if (!exam) return res.status(404).json({ error: 'Prova não encontrada.' });
    res.json(exam);
  } catch (err) { next(err); }
});

// ── POST /api/v1/exams ───────────────────────────────────────
router.post('/',
  authorize('teacher', 'coordinator', 'admin'),
  [
    body('title').trim().isLength({ min: 2, max: 300 }).withMessage('Título obrigatório (mín. 2 caracteres).'),
    body('classIds').isArray({ min: 1 }).withMessage('Selecione ao menos uma turma.'),
    body('questions').isArray({ min: 1 }).withMessage('Adicione ao menos uma questão.'),
    body('questions.*.number').isInt({ min: 1 }),
    body('questions.*.type').isIn(['multiple_choice', 'true_false', 'numeric']),
    body('questions.*.correctAnswer').notEmpty(),
  ],
  auditLog('create_exam'),
  async (req, res, next) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) {
      return res.status(422).json({ error: errs.array().map(e => e.msg).join('; ') });
    }
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { title, description, subjectId, classIds, examDate,
              totalScore = 10, passingScore = 5, questions, cardConfig } = req.body;

      const { rows: [exam] } = await client.query(
        `INSERT INTO exams (school_id, subject_id, created_by, title, description,
                            exam_date, total_score, passing_score, card_config)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.user.schoolId, subjectId || null, req.user.id, title, description || null,
         examDate || null, totalScore, passingScore, JSON.stringify(cardConfig ?? {})],
      );

      // Link classes
      for (const classId of classIds) {
        await client.query(
          `INSERT INTO exam_classes (exam_id, class_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [exam.id, classId]
        );
      }

      // Insert questions
      for (const q of questions) {
        await client.query(
          `INSERT INTO questions (exam_id, number, type, correct_answer, score)
           VALUES ($1,$2,$3,$4,$5)`,
          [exam.id, q.number, q.type, q.correctAnswer, q.score ?? 1]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ ...exam, questions });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally { client.release(); }
  }
);

// ── PATCH /api/v1/exams/:id ──────────────────────────────────
router.patch('/:id', authorize('teacher','coordinator','admin'), async (req, res, next) => {
  try {
    const allowed = ['title','description','exam_date','status','passing_score','card_config'];
    const sets = []; const vals = [req.params.id, req.user.schoolId]; let idx = 3;
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { sets.push(`${k} = $${idx++}`); vals.push(v); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    const { rows: [exam] } = await db.query(
      `UPDATE exams SET ${sets.join(',')} WHERE id=$1 AND school_id=$2 RETURNING *`, vals
    );
    if (!exam) return res.status(404).json({ error: 'Prova não encontrada.' });
    res.json(exam);
  } catch (err) { next(err); }
});

// ── POST /api/v1/exams/:id/publish ──────────────────────────
router.post('/:id/publish', authorize('teacher','coordinator','admin'), auditLog('publish_exam'), async (req, res, next) => {
  try {
    const { rows: [exam] } = await db.query(
      `UPDATE exams SET status = 'published', published_at = NOW()
       WHERE id = $1 AND school_id = $2 AND status = 'draft' RETURNING *`,
      [req.params.id, req.user.schoolId]
    );
    if (!exam) return res.status(400).json({ error: 'Prova não encontrada ou já publicada.' });
    res.json(exam);
  } catch (err) { next(err); }
});

// ── POST /api/v1/exams/:id/nullify-question ─────────────────
router.post('/:id/nullify-question', authorize('coordinator','admin'), async (req, res, next) => {
  try {
    await db.query(
      `UPDATE questions SET is_nullified = NOT is_nullified WHERE id = $1 AND exam_id = $2`,
      [req.body.questionId, req.params.id]
    );
    res.json({ message: 'Questão atualizada.' });
  } catch (err) { next(err); }
});

// ── GET /api/v1/exams/:id/generate-pdf ──────────────────────
router.get('/:id/generate-pdf', async (req, res, next) => {
  try {
    const { classId, studentId } = req.query;
    const { rows: [exam] } = await db.query(
      `SELECT e.*, json_agg(q ORDER BY q.number) AS questions
       FROM exams e LEFT JOIN questions q ON q.exam_id = e.id
       WHERE e.id = $1 AND e.school_id = $2 GROUP BY e.id`,
      [req.params.id, req.user.schoolId]
    );
    if (!exam) return res.status(404).json({ error: 'Prova não encontrada.' });

    let studentsQ = `
      SELECT s.id, s.name, s.enrollment_code, c.name AS class_name
      FROM students s
      JOIN student_classes sc ON sc.student_id = s.id
      JOIN classes c ON c.id = sc.class_id
      JOIN exam_classes ec ON ec.class_id = c.id
      WHERE ec.exam_id = $1 AND s.is_active = true`;
    const sparams = [req.params.id];
    if (classId) { studentsQ += ` AND c.id = $2`; sparams.push(classId); }
    if (studentId) { studentsQ += ` AND s.id = $${sparams.length+1}`; sparams.push(studentId); }
    studentsQ += ' ORDER BY c.name, s.name';

    const { rows: students } = await db.query(studentsQ, sparams);

    const cards = await Promise.all(students.map(async (student) => {
      const qrData = JSON.stringify({ examId: exam.id, studentId: student.id, v: 1 });
      const qrCode = await generateQRCode(qrData);
      const qrKey = Buffer.from(qrData).toString('base64').slice(0, 190);
      await db.query(
        `INSERT INTO answer_cards (exam_id, student_id, qr_code, status)
         VALUES ($1, $2, $3, 'pending') ON CONFLICT (qr_code) DO NOTHING`,
        [exam.id, student.id, qrKey]
      );
      return { student, qrCode };
    }));

    const pdfBuffer = await generateCardPDF(exam, cards);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="cartoes-${exam.id.slice(0,8)}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

export default router;
