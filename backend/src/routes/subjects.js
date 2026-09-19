// src/routes/subjects.js
import { Router } from 'express';
import { db } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM subjects WHERE school_id = $1 ORDER BY name`, [req.user.schoolId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, code } = req.body;
    const { rows: [sub] } = await db.query(
      `INSERT INTO subjects (school_id, name, code) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.schoolId, name, code ?? null]
    );
    res.status(201).json(sub);
  } catch (err) { next(err); }
});

export default router;
