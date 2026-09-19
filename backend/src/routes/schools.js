// src/routes/schools.js
import { Router } from 'express';
import { db } from '../db/pool.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('superadmin','admin'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, COUNT(DISTINCT u.id)::int AS user_count,
              COUNT(DISTINCT st.id)::int AS student_count,
              COUNT(DISTINCT e.id)::int AS exam_count
       FROM schools s
       LEFT JOIN users u ON u.school_id = s.id AND u.is_active = true
       LEFT JOIN students st ON st.school_id = s.id AND st.is_active = true
       LEFT JOIN exams e ON e.school_id = s.id
       GROUP BY s.id ORDER BY s.name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const targetId = req.user.role === 'superadmin' ? req.params.id : req.user.schoolId;
    const { rows: [school] } = await db.query(
      `SELECT s.*,
         COUNT(DISTINCT u.id)::int AS user_count,
         COUNT(DISTINCT st.id)::int AS student_count,
         COUNT(DISTINCT c.id)::int AS class_count,
         COUNT(DISTINCT e.id)::int AS exam_count
       FROM schools s
       LEFT JOIN users u ON u.school_id = s.id AND u.is_active = true
       LEFT JOIN students st ON st.school_id = s.id AND st.is_active = true
       LEFT JOIN classes c ON c.school_id = s.id AND c.is_active = true
       LEFT JOIN exams e ON e.school_id = s.id
       WHERE s.id = $1 GROUP BY s.id`, [targetId]
    );
    if (!school) return res.status(404).json({ error: 'Escola nao encontrada.' });
    res.json(school);
  } catch (err) { next(err); }
});

router.patch('/:id', authorize('admin','superadmin'), auditLog('update_school'), async (req, res, next) => {
  try {
    const targetId = req.user.role === 'superadmin' ? req.params.id : req.user.schoolId;
    const allowed = ['name','city','state','settings'];
    const sets = []; const vals = [targetId]; let idx = 2;
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { sets.push(`${k} = $${idx++}`); vals.push(k==='settings'?JSON.stringify(v):v); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    const { rows: [school] } = await db.query(
      `UPDATE schools SET ${sets.join(',')} WHERE id = $1 RETURNING *`, vals
    );
    if (!school) return res.status(404).json({ error: 'Escola nao encontrada.' });
    res.json(school);
  } catch (err) { next(err); }
});

export default router;
