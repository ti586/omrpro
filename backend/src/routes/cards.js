// src/routes/cards.js
import { Router } from 'express';
import { param, body, query, validationResult } from 'express-validator';
import { db } from '../db/pool.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';
import { omrQueue } from '../workers/index.js';

const router = Router();
router.use(authenticate);

// ── GET /api/v1/cards?examId=&status=&page= ─────────────────
router.get('/', async (req, res, next) => {
  try {
    const { examId, status, classId, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let where = ['e.school_id = $1'];
    const params = [req.user.schoolId];
    let idx = 2;

    if (examId)  { where.push(`ac.exam_id = $${idx++}`);   params.push(examId); }
    if (status)  { where.push(`ac.status = $${idx++}`);    params.push(status); }
    if (classId) { where.push(`ac.class_id = $${idx++}`);  params.push(classId); }

    const whereSQL = where.join(' AND ');

    const [rows, countRow] = await Promise.all([
      db.query(
        `SELECT
           ac.id, ac.status, ac.total_score, ac.percentage,
           ac.correct_count, ac.wrong_count, ac.blank_count,
           ac.omr_confidence, ac.rotation_angle,
           ac.error_type, ac.error_details,
           ac.uploaded_at, ac.processed_at,
           ac.image_original,
           s.name  AS student_name,
           s.enrollment_code,
           c.name  AS class_name,
           e.title AS exam_title,
           u.name  AS reviewed_by_name
         FROM answer_cards ac
         JOIN exams e    ON e.id = ac.exam_id
         LEFT JOIN students s ON s.id = ac.student_id
         LEFT JOIN classes  c ON c.id = ac.class_id
         LEFT JOIN users    u ON u.id = ac.reviewed_by
         WHERE ${whereSQL}
         ORDER BY ac.uploaded_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset],
      ),
      db.query(
        `SELECT COUNT(*)::int FROM answer_cards ac
         JOIN exams e ON e.id = ac.exam_id
         WHERE ${whereSQL}`,
        params,
      ),
    ]);

    res.json({
      cards: rows.rows,
      pagination: { total: countRow.rows[0].count, page: +page, limit: +limit },
    });
  } catch (err) { next(err); }
});

// ── GET /api/v1/cards/:id ───────────────────────────────────
router.get('/:id', param('id').isUUID(), async (req, res, next) => {
  try {
    const { rows: [card] } = await db.query(
      `SELECT
         ac.*,
         s.name AS student_name, s.enrollment_code,
         c.name AS class_name,
         e.title AS exam_title, e.total_score AS exam_total_score,
         json_agg(
           json_build_object(
             'question_number', q.number,
             'question_type',   q.type,
             'correct_answer',  q.correct_answer,
             'marked_answer',   sa.marked_answer,
             'is_correct',      sa.is_correct,
             'score_earned',    sa.score_earned,
             'is_blank',        sa.is_blank,
             'has_multiple',    sa.has_multiple,
             'omr_confidence',  sa.omr_confidence
           ) ORDER BY q.number
         ) AS answers
       FROM answer_cards ac
       JOIN exams e      ON e.id  = ac.exam_id
       LEFT JOIN students s ON s.id = ac.student_id
       LEFT JOIN classes  c ON c.id = ac.class_id
       LEFT JOIN student_answers sa ON sa.card_id = ac.id
       LEFT JOIN questions q ON q.id = sa.question_id
       WHERE ac.id = $1 AND e.school_id = $2
       GROUP BY ac.id, s.name, s.enrollment_code, c.name, e.title, e.total_score`,
      [req.params.id, req.user.schoolId],
    );

    if (!card) return res.status(404).json({ error: 'Cartão não encontrado.' });
    res.json(card);
  } catch (err) { next(err); }
});

// ── PATCH /api/v1/cards/:id/review — manual correction ──────
router.patch(
  '/:id/review',
  authorize('teacher', 'coordinator', 'admin'),
  [
    param('id').isUUID(),
    body('answers').isArray(),
    body('answers.*.questionId').isUUID(),
    body('answers.*.markedAnswer').isString(),
  ],
  auditLog('manual_review_card'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Update each manually-corrected answer
      for (const ans of req.body.answers) {
        const { rows: [q] } = await client.query(
          `SELECT correct_answer, score FROM questions WHERE id = $1`,
          [ans.questionId],
        );
        if (!q) continue;

        const isCorrect   = ans.markedAnswer === q.correct_answer;
        const scoreEarned = isCorrect ? q.score : 0;

        await client.query(
          `UPDATE student_answers
           SET marked_answer = $1, is_correct = $2, score_earned = $3,
               is_blank = false, has_multiple = false
           WHERE card_id = $4 AND question_id = $5`,
          [ans.markedAnswer, isCorrect, scoreEarned, req.params.id, ans.questionId],
        );
      }

      // Recalculate totals
      const { rows: [totals] } = await client.query(
        `SELECT
           SUM(sa.score_earned)::numeric(6,2)                       AS total_score,
           COUNT(*) FILTER (WHERE sa.is_correct)::int               AS correct_count,
           COUNT(*) FILTER (WHERE NOT sa.is_correct
                                  AND NOT sa.is_blank)::int         AS wrong_count,
           COUNT(*) FILTER (WHERE sa.is_blank)::int                 AS blank_count
         FROM student_answers sa WHERE sa.card_id = $1`,
        [req.params.id],
      );

      const { rows: [exam] } = await client.query(
        `SELECT e.total_score AS max_score
         FROM answer_cards ac JOIN exams e ON e.id = ac.exam_id
         WHERE ac.id = $1`,
        [req.params.id],
      );

      const pct = exam?.max_score
        ? Math.round((totals.total_score / exam.max_score) * 100)
        : 0;

      await client.query(
        `UPDATE answer_cards
         SET status       = 'graded',
             total_score  = $1,
             percentage   = $2,
             correct_count= $3,
             wrong_count  = $4,
             blank_count  = $5,
             reviewed_by  = $6,
             reviewed_at  = NOW()
         WHERE id = $7`,
        [
          totals.total_score, pct,
          totals.correct_count, totals.wrong_count, totals.blank_count,
          req.user.id, req.params.id,
        ],
      );

      await client.query('COMMIT');
      res.json({ message: 'Cartão revisado com sucesso.', totalScore: totals.total_score, percentage: pct });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  },
);

// ── POST /api/v1/cards/:id/retry — re-queue failed card ─────
router.post('/:id/retry', authorize('teacher', 'coordinator', 'admin'), async (req, res, next) => {
  try {
    const { rows: [card] } = await db.query(
      `SELECT ac.id, ac.exam_id, ac.image_path
       FROM answer_cards ac
       JOIN exams e ON e.id = ac.exam_id
       WHERE ac.id = $1 AND e.school_id = $2`,
      [req.params.id, req.user.schoolId],
    );

    if (!card) return res.status(404).json({ error: 'Cartão não encontrado.' });

    await db.query(
      `UPDATE answer_cards SET status = 'pending' WHERE id = $1`,
      [card.id],
    );

    await omrQueue.add(
      'process-card',
      { cardId: card.id, examId: card.exam_id, imagePath: card.image_path },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    res.json({ message: 'Cartão re-enfileirado para processamento.' });
  } catch (err) { next(err); }
});

// ── DELETE /api/v1/cards/:id ─────────────────────────────────
router.delete(
  '/:id',
  authorize('coordinator', 'admin'),
  auditLog('delete_card'),
  async (req, res, next) => {
    try {
      const { rowCount } = await db.query(
        `DELETE FROM answer_cards ac
         USING exams e
         WHERE ac.exam_id = e.id AND ac.id = $1 AND e.school_id = $2`,
        [req.params.id, req.user.schoolId],
      );
      if (!rowCount) return res.status(404).json({ error: 'Cartão não encontrado.' });
      res.json({ message: 'Cartão removido.' });
    } catch (err) { next(err); }
  },
);

export default router;
