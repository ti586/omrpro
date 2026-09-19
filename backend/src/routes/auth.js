// src/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { db } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { auditLog } from '../middleware/audit.js';

const router = Router();

function makeTokens(userId) {
  const payload = { sub: userId };
  const accessToken  = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' });
  const refreshToken = jwt.sign(payload, process.env.JWT_SECRET + '_refresh', { expiresIn: '30d' });
  return { accessToken, refreshToken };
}

router.post('/login',
  [body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 6 })],
  async (req, res, next) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() });
    try {
      const { email, password } = req.body;
      const { rows } = await db.query(
        `SELECT u.*, s.name AS school_name, s.plan AS school_plan
         FROM users u JOIN schools s ON s.id = u.school_id
         WHERE u.email = $1 AND u.is_active = true`, [email]
      );
      const user = rows[0];
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: 'Credenciais invalidas.' });
      }
      const { accessToken, refreshToken } = makeTokens(user.id);
      await db.query(
        `UPDATE users SET refresh_token = $1, last_login_at = NOW() WHERE id = $2`,
        [await bcrypt.hash(refreshToken, 8), user.id]
      );
      res.json({ accessToken, refreshToken, user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        schoolId: user.school_id, schoolName: user.school_name, schoolPlan: user.school_plan,
      }});
    } catch (err) { next(err); }
  }
);

router.post('/register',
  [
    body('name').trim().isLength({ min: 2 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('schoolCode').trim().notEmpty(),
    body('role').isIn(['teacher','coordinator']),
  ],
  async (req, res, next) => {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() });
    try {
      const { name, email, password, schoolCode, role } = req.body;
      const { rows: [school] } = await db.query(
        `SELECT id FROM schools WHERE code = $1 AND is_active = true`, [schoolCode]
      );
      if (!school) return res.status(404).json({ error: 'Codigo de escola invalido.' });
      const exists = await db.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
      if (exists.rows[0]) return res.status(409).json({ error: 'Email ja cadastrado.' });
      const hash = await bcrypt.hash(password, 12);
      const { rows: [u] } = await db.query(
        `INSERT INTO users (school_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role`,
        [school.id, name, email, hash, role]
      );
      const { accessToken, refreshToken } = makeTokens(u.id);
      res.status(201).json({ accessToken, refreshToken, user: u });
    } catch (err) { next(err); }
  }
);

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Token nao fornecido.' });
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET + '_refresh');
    const { rows } = await db.query(
      `SELECT id, refresh_token FROM users WHERE id = $1 AND is_active = true`, [payload.sub]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(refreshToken, user.refresh_token))) {
      return res.status(401).json({ error: 'Refresh token invalido.' });
    }
    const tokens = makeTokens(user.id);
    await db.query(
      `UPDATE users SET refresh_token = $1 WHERE id = $2`,
      [await bcrypt.hash(tokens.refreshToken, 8), user.id]
    );
    res.json(tokens);
  } catch (err) {
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Token invalido.' });
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.school_id AS "schoolId",
              s.name AS school_name, s.logo_url, s.plan
       FROM users u JOIN schools s ON s.id = u.school_id WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/logout', authenticate, auditLog('logout'), async (req, res, next) => {
  try {
    await db.query(`UPDATE users SET refresh_token = NULL WHERE id = $1`, [req.user.id]);
    res.json({ message: 'Logout realizado.' });
  } catch (err) { next(err); }
});

export default router;
