// src/routes/classes.js
import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { db } from '../db/pool.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, u.name AS teacher_name,
         COUNT(DISTINCT sc.student_id)::int AS student_count,
         COUNT(DISTINCT ec.exam_id)::int AS exam_count
       FROM classes c
       LEFT JOIN users u ON u.id = c.teacher_id
       LEFT JOIN student_classes sc ON sc.class_id = c.id
       LEFT JOIN exam_classes ec ON ec.class_id = c.id
       WHERE c.school_id = $1 AND c.is_active = true
       GROUP BY c.id, u.name ORDER BY c.year DESC, c.name`,
      [req.user.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', param('id').isUUID(), async (req, res, next) => {
  try {
    const { rows: [cls] } = await db.query(
      `SELECT c.*, u.name AS teacher_name,
         json_agg(DISTINCT jsonb_build_object('id',s.id,'name',s.name,'enrollment_code',s.enrollment_code))
           FILTER (WHERE s.id IS NOT NULL) AS students
       FROM classes c
       LEFT JOIN users u ON u.id = c.teacher_id
       LEFT JOIN student_classes sc ON sc.class_id = c.id
       LEFT JOIN students s ON s.id = sc.student_id AND s.is_active = true
       WHERE c.id = $1 AND c.school_id = $2 GROUP BY c.id, u.name`,
      [req.params.id, req.user.schoolId]
    );
    if (!cls) return res.status(404).json({ error: 'Turma nao encontrada.' });
    res.json(cls);
  } catch (err) { next(err); }
});

router.post('/',
  authorize('coordinator','admin'),
  [body('name').trim().isLength({ min: 1, max: 100 })],
  auditLog('create_class'),
  async (req, res, next) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() });
    try {
      const { name, grade, teacherId, year = new Date().getFullYear() } = req.body;
      const { rows: [cls] } = await db.query(
        `INSERT INTO classes (school_id, teacher_id, name, grade, year) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.user.schoolId, teacherId ?? null, name, grade ?? null, year]
      );
      res.status(201).json(cls);
    } catch (err) { next(err); }
  }
);

router.patch('/:id', authorize('coordinator','admin'), auditLog('update_class'), async (req, res, next) => {
  try {
    const allowed = ['name','grade','teacher_id','year','is_active'];
    const sets = []; const vals = [req.params.id, req.user.schoolId]; let idx = 3;
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { sets.push(`${k} = $${idx++}`); vals.push(v); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    const { rows: [cls] } = await db.query(
      `UPDATE classes SET ${sets.join(',')} WHERE id=$1 AND school_id=$2 RETURNING *`, vals
    );
    if (!cls) return res.status(404).json({ error: 'Turma nao encontrada.' });
    res.json(cls);
  } catch (err) { next(err); }
});

router.post('/:id/add-student', authorize('coordinator','admin'), async (req, res, next) => {
  try {
    const { studentId } = req.body;
    await db.query(
      `INSERT INTO student_classes (student_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [studentId, req.params.id]
    );
    res.json({ message: 'Aluno adicionado.' });
  } catch (err) { next(err); }
});

export default router;
