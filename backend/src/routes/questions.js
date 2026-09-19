// src/routes/questions.js
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { db } from '../db/pool.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);

// ── GET /api/v1/questions?examId= ────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { examId } = req.query;
    if (!examId) return res.status(400).json({ error: 'examId é obrigatório.' });

    const { rows } = await db.query(
      `SELECT q.*,
         COUNT(sa.id)::int AS answer_count,
         COUNT(sa.id) FILTER (WHERE sa.is_correct)::int AS correct_count,
         ROUND(
           COUNT(sa.id) FILTER (WHERE NOT sa.is_correct AND NOT sa.is_blank)
           * 100.0 / NULLIF(COUNT(sa.id), 0), 1
         ) AS error_rate
       FROM questions q
       LEFT JOIN student_answers sa ON sa.question_id = q.id
       LEFT JOIN exams e ON e.id = q.exam_id
       WHERE q.exam_id = $1 AND e.school_id = $2
       GROUP BY q.id ORDER BY q.number`,
      [examId, req.user.schoolId],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── PUT /api/v1/questions/:id — update answer/score ──────────
router.put(
  '/:id',
  authorize('teacher', 'coordinator', 'admin'),
  [
    param('id').isUUID(),
    body('correctAnswer').optional().isString(),
    body('score').optional().isFloat({ min: 0 }),
    body('isNullified').optional().isBoolean(),
  ],
  auditLog('update_question'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    try {
      const allowed = ['correct_answer', 'score', 'is_nullified'];
      const map     = { correctAnswer: 'correct_answer', score: 'score', isNullified: 'is_nullified' };
      const sets    = [];
      const vals    = [req.params.id, req.user.schoolId];
      let   idx     = 3;

      for (const [k, v] of Object.entries(req.body)) {
        const col = map[k];
        if (col) { sets.push(`${col} = $${idx++}`); vals.push(v); }
      }
      if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });

      const { rows: [q] } = await db.query(
        `UPDATE questions SET ${sets.join(', ')}
         FROM exams e
         WHERE questions.id = $1
           AND questions.exam_id = e.id
           AND e.school_id = $2
         RETURNING questions.*`,
        vals,
      );
      if (!q) return res.status(404).json({ error: 'Questão não encontrada.' });
      res.json(q);
    } catch (err) { next(err); }
  },
);

// ── POST /api/v1/questions/bulk-update ───────────────────────
// Update multiple questions at once (e.g. paste full answer key)
router.post(
  '/bulk-update',
  authorize('teacher', 'coordinator', 'admin'),
  [
    body('examId').isUUID(),
    body('questions').isArray({ min: 1 }),
    body('questions.*.id').isUUID(),
    body('questions.*.correctAnswer').isString(),
  ],
  auditLog('bulk_update_questions'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      for (const q of req.body.questions) {
        await client.query(
          `UPDATE questions SET correct_answer = $1
           FROM exams e
           WHERE questions.id = $2 AND questions.exam_id = $3
             AND questions.exam_id = e.id AND e.school_id = $4`,
          [q.correctAnswer, q.id, req.body.examId, req.user.schoolId],
        );
      }

      await client.query('COMMIT');
      res.json({ updated: req.body.questions.length });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  },
);

export default router;
