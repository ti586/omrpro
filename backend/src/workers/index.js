// src/workers/index.js — BullMQ Worker
import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import { createReadStream, existsSync } from 'fs';
import FormData from 'form-data';
import { logger } from '../db/logger.js';
import { db } from '../db/pool.js';
import { connectRedis, redis } from '../db/redis.js';

const OMR_URL = process.env.OMR_SERVICE_URL ?? 'http://omr-service:5001';

const connection = {
  host: (process.env.REDIS_URL ?? 'redis://redis:6379')
    .replace('redis://', '').split(':')[0],
  port: 6379,
};

// ── Queue exports (used by routes) ──────────────────────────
export const omrQueue    = new Queue('omr-processing',    { connection });
export const reportQueue = new Queue('report-generation', { connection });
export const emailQueue  = new Queue('email',             { connection });

// ── OMR Processing Worker ────────────────────────────────────
const omrWorker = new Worker(
  'omr-processing',
  async (job) => {
    const { cardId, examId, imagePath } = job.data;
    logger.info({ cardId, examId }, 'Processing OMR card');

    await db.query(`UPDATE answer_cards SET status = 'processing' WHERE id = $1`, [cardId]);

    if (redis) {
      await redis.publish(`exam:${examId}:progress`, JSON.stringify({
        type: 'card_processing', cardId, examId,
      }));
    }

    // Fetch exam layout + answer key
    const { rows: [exam] } = await db.query(
      `SELECT e.total_score, e.passing_score,
              json_agg(
                json_build_object(
                  'number', q.number, 'type', q.type,
                  'correctAnswer', q.correct_answer,
                  'score', q.score, 'isNullified', q.is_nullified,
                  'region', q.metadata->'region'
                ) ORDER BY q.number
              ) AS questions
       FROM exams e LEFT JOIN questions q ON q.exam_id = e.id
       WHERE e.id = $1 GROUP BY e.id`,
      [examId],
    );
    if (!exam) throw new Error(`Exam ${examId} not found`);

    const answerKey = {};
    (exam.questions ?? []).forEach((q) => {
      answerKey[q.number] = {
        correct_answer: q.correctAnswer,
        score: q.score,
        is_nullified: q.isNullified,
      };
    });

    const layout = {
      questions: (exam.questions ?? []).map((q) => ({
        number: q.number, type: q.type, region: q.region ?? {},
      })),
    };

    if (!existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);

    // Use native fetch (Node 18+) with FormData
    const form = new FormData();
    form.append('image', createReadStream(imagePath));
    form.append('request', JSON.stringify({
      card_id: cardId, exam_id: examId, layout,
      answer_key: answerKey, total_score: exam.total_score,
    }));

    const response = await fetch(`${OMR_URL}/process`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OMR service error ${response.status}: ${err}`);
    }

    const result = await response.json();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE answer_cards SET
           status = $2, processed_at = NOW(),
           total_score = $3, percentage = $4,
           correct_count = $5, wrong_count = $6, blank_count = $7,
           omr_confidence = $8, rotation_angle = $9, perspective_pts = $10
         WHERE id = $1`,
        [
          cardId,
          result.success ? 'graded' : 'error',
          result.total_score, result.percentage,
          result.correct_count, result.wrong_count, result.blank_count,
          result.omr_confidence, result.rotation_angle,
          JSON.stringify(result.perspective_corners ?? []),
        ],
      );

      if (result.question_results?.length) {
        const { rows: qRows } = await client.query(
          `SELECT id, number FROM questions WHERE exam_id = $1`, [examId],
        );
        const qIdMap = Object.fromEntries(qRows.map((q) => [q.number, q.id]));
        const filtered = result.question_results.filter((qr) => qIdMap[qr.question_number]);
        if (filtered.length) {
          const values = filtered.map((_, i) => {
            const b = i * 7;
            return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})`;
          }).join(',');
          const params = filtered.flatMap((qr) => [
            cardId, qIdMap[qr.question_number],
            qr.marked_answer, qr.is_correct,
            qr.score_earned, qr.confidence,
            qr.marked_answer === null,
          ]);
          await client.query(
            `INSERT INTO student_answers
               (card_id, question_id, marked_answer, is_correct,
                score_earned, omr_confidence, is_blank)
             VALUES ${values}
             ON CONFLICT (card_id, question_id) DO UPDATE SET
               marked_answer = EXCLUDED.marked_answer,
               is_correct = EXCLUDED.is_correct,
               score_earned = EXCLUDED.score_earned,
               omr_confidence = EXCLUDED.omr_confidence,
               is_blank = EXCLUDED.is_blank`,
            params,
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await reportQueue.add('update-stats', { examId }, { priority: 5 });

    if (redis) {
      await redis.publish(`exam:${examId}:progress`, JSON.stringify({
        type: 'card_graded', cardId, examId,
        totalScore: result.total_score,
        percentage: result.percentage,
        confidence: result.omr_confidence,
        warnings: result.warnings,
      }));
    }

    logger.info({ cardId, score: result.total_score }, 'Card graded');
    return { cardId, score: result.total_score };
  },
  { connection, concurrency: 4 },
);

// ── Report Worker ────────────────────────────────────────────
const reportWorker = new Worker(
  'report-generation',
  async (job) => {
    const { examId } = job.data;
    await db.query(
      `INSERT INTO exam_statistics (
         exam_id, class_id, total_students, graded_count,
         avg_score, min_score, max_score, std_deviation,
         pass_count, fail_count, computed_at
       )
       SELECT
         ac.exam_id, NULL,
         COUNT(*)::int,
         COUNT(*) FILTER (WHERE ac.status = 'graded')::int,
         AVG(ac.total_score)  FILTER (WHERE ac.status = 'graded'),
         MIN(ac.total_score)  FILTER (WHERE ac.status = 'graded'),
         MAX(ac.total_score)  FILTER (WHERE ac.status = 'graded'),
         STDDEV(ac.total_score) FILTER (WHERE ac.status = 'graded'),
         COUNT(*) FILTER (WHERE ac.total_score >= e.passing_score AND ac.status = 'graded')::int,
         COUNT(*) FILTER (WHERE ac.total_score <  e.passing_score AND ac.status = 'graded')::int,
         NOW()
       FROM answer_cards ac JOIN exams e ON e.id = ac.exam_id
       WHERE ac.exam_id = $1
       GROUP BY ac.exam_id
       ON CONFLICT (exam_id, class_id) DO UPDATE SET
         total_students = EXCLUDED.total_students,
         graded_count   = EXCLUDED.graded_count,
         avg_score      = EXCLUDED.avg_score,
         min_score      = EXCLUDED.min_score,
         max_score      = EXCLUDED.max_score,
         std_deviation  = EXCLUDED.std_deviation,
         pass_count     = EXCLUDED.pass_count,
         fail_count     = EXCLUDED.fail_count,
         computed_at    = NOW()`,
      [examId],
    );
    logger.info({ examId }, 'Stats updated');
  },
  { connection, concurrency: 2 },
);

// ── Error handling ────────────────────────────────────────────
omrWorker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'OMR job failed');
  if (job?.data?.cardId) {
    await db.query(
      `UPDATE answer_cards SET status = 'error', error_details = $2 WHERE id = $1`,
      [job.data.cardId, JSON.stringify({ message: err.message })],
    ).catch(() => {});
  }
});

// ── Boot (when run as standalone worker process) ──────────────
if (process.argv[1]?.includes('workers/index')) {
  connectRedis().then(() => {
    logger.info('🔧 Workers iniciados: omr-processing, report-generation');
  });
}
