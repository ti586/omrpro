// src/routes/students.js
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import multer from 'multer';
import { db } from '../db/pool.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

const router  = Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.use(authenticate);

// ── GET /api/v1/students ─────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { classId, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let where = ['s.school_id = $1', 's.is_active = true'];
    const params = [req.user.schoolId];
    let idx = 2;

    if (classId) {
      where.push(`EXISTS (
        SELECT 1 FROM student_classes sc WHERE sc.student_id = s.id AND sc.class_id = $${idx++}
      )`);
      params.push(classId);
    }
    if (search) {
      where.push(`(s.name ILIKE $${idx} OR s.enrollment_code ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereSQL = where.join(' AND ');

    const [rows, countRow] = await Promise.all([
      db.query(
        `SELECT
           s.id, s.name, s.enrollment_code, s.birth_date, s.is_active,
           json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name)) AS classes,
           AVG(ac.total_score) FILTER (WHERE ac.status = 'graded') AS avg_score,
           COUNT(DISTINCT ac.id) FILTER (WHERE ac.status = 'graded')::int AS exams_taken
         FROM students s
         LEFT JOIN student_classes sc ON sc.student_id = s.id
         LEFT JOIN classes c ON c.id = sc.class_id
         LEFT JOIN answer_cards ac ON ac.student_id = s.id
         WHERE ${whereSQL}
         GROUP BY s.id
         ORDER BY s.name
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset],
      ),
      db.query(
        `SELECT COUNT(*)::int FROM students s WHERE ${whereSQL}`,
        params,
      ),
    ]);

    res.json({
      students: rows.rows,
      pagination: { total: countRow.rows[0].count, page: +page, limit: +limit },
    });
  } catch (err) { next(err); }
});

// ── GET /api/v1/students/:id ─────────────────────────────────
router.get('/:id', param('id').isUUID(), async (req, res, next) => {
  try {
    const { rows: [student] } = await db.query(
      `SELECT
         s.*,
         json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name)) AS classes,
         json_agg(DISTINCT jsonb_build_object(
           'exam_id',    ac.exam_id,
           'exam_title', e.title,
           'score',      ac.total_score,
           'percentage', ac.percentage,
           'status',     ac.status,
           'date',       e.exam_date
         ) ORDER BY e.exam_date DESC) FILTER (WHERE ac.id IS NOT NULL) AS history
       FROM students s
       LEFT JOIN student_classes sc ON sc.student_id = s.id
       LEFT JOIN classes c ON c.id = sc.class_id
       LEFT JOIN answer_cards ac ON ac.student_id = s.id
       LEFT JOIN exams e ON e.id = ac.exam_id
       WHERE s.id = $1 AND s.school_id = $2
       GROUP BY s.id`,
      [req.params.id, req.user.schoolId],
    );
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' });
    res.json(student);
  } catch (err) { next(err); }
});

// ── POST /api/v1/students ────────────────────────────────────
router.post(
  '/',
  authorize('teacher', 'coordinator', 'admin'),
  [
    body('name').trim().isLength({ min: 2, max: 200 }),
    body('enrollmentCode').trim().isLength({ min: 1, max: 30 }),
    body('classIds').optional().isArray(),
    body('birthDate').optional().isISO8601(),
  ],
  auditLog('create_student'),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { name, enrollmentCode, classIds = [], birthDate } = req.body;

      const { rows: [student] } = await client.query(
        `INSERT INTO students (school_id, name, enrollment_code, birth_date)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.user.schoolId, name, enrollmentCode, birthDate ?? null],
      );

      if (classIds.length) {
        await client.query(
          `INSERT INTO student_classes (student_id, class_id)
           SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
          [student.id, classIds],
        );
      }

      await client.query('COMMIT');
      res.status(201).json(student);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Matrícula já cadastrada.' });
      }
      next(err);
    } finally {
      client.release();
    }
  },
);

// ── PATCH /api/v1/students/:id ───────────────────────────────
router.patch(
  '/:id',
  authorize('teacher', 'coordinator', 'admin'),
  auditLog('update_student'),
  async (req, res, next) => {
    try {
      const allowed = ['name', 'enrollment_code', 'birth_date', 'is_active'];
      const sets    = [];
      const vals    = [req.params.id, req.user.schoolId];
      let   idx     = 3;

      for (const [k, v] of Object.entries(req.body)) {
        if (allowed.includes(k)) { sets.push(`${k} = $${idx++}`); vals.push(v); }
      }
      if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });

      const { rows: [s] } = await db.query(
        `UPDATE students SET ${sets.join(', ')} WHERE id = $1 AND school_id = $2 RETURNING *`,
        vals,
      );
      if (!s) return res.status(404).json({ error: 'Aluno não encontrado.' });
      res.json(s);
    } catch (err) { next(err); }
  },
);

// ── POST /api/v1/students/import-csv ─────────────────────────
router.post(
  '/import-csv',
  authorize('coordinator', 'admin'),
  upload.single('file'),
  auditLog('import_students_csv'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Arquivo CSV não enviado.' });

      const { classId } = req.body;
      const text = req.file.buffer.toString('utf8');
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

      // Skip header row
      const dataLines = lines[0].toLowerCase().includes('nome') ? lines.slice(1) : lines;

      const results = { created: 0, skipped: 0, errors: [] };
      const client  = await db.connect();

      try {
        await client.query('BEGIN');

        for (const line of dataLines) {
          // Support comma and semicolon separators
          const cols = line.split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ''));
          const [name, enrollmentCode, birthDate] = cols;

          if (!name || !enrollmentCode) {
            results.errors.push(`Linha inválida: ${line}`);
            continue;
          }

          try {
            const { rows: [student] } = await client.query(
              `INSERT INTO students (school_id, name, enrollment_code, birth_date)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (enrollment_code) DO UPDATE SET name = EXCLUDED.name
               RETURNING id`,
              [req.user.schoolId, name, enrollmentCode, birthDate || null],
            );

            if (classId && student) {
              await client.query(
                `INSERT INTO student_classes (student_id, class_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [student.id, classId],
              );
            }

            results.created++;
          } catch (rowErr) {
            results.skipped++;
            results.errors.push(`${enrollmentCode}: ${rowErr.message}`);
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.json(results);
    } catch (err) { next(err); }
  },
);

// ── DELETE /api/v1/students/:id (soft delete) ────────────────
router.delete(
  '/:id',
  authorize('coordinator', 'admin'),
  auditLog('deactivate_student'),
  async (req, res, next) => {
    try {
      await db.query(
        `UPDATE students SET is_active = false WHERE id = $1 AND school_id = $2`,
        [req.params.id, req.user.schoolId],
      );
      res.json({ message: 'Aluno desativado.' });
    } catch (err) { next(err); }
  },
);

export default router;
