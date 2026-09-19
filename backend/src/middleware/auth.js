// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { db } from '../db/pool.js';

export async function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token nao fornecido.' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.school_id AS "schoolId", u.is_active
       FROM users u WHERE u.id = $1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Usuario inativo ou nao encontrado.' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado.', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token invalido.' });
  }
}

const ROLE_LEVEL = { superadmin:5, admin:4, coordinator:3, teacher:2, student:1 };

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Nao autenticado.' });
    const userLevel = ROLE_LEVEL[req.user.role] ?? 0;
    const allowed = roles.some(r => (ROLE_LEVEL[r] ?? 0) <= userLevel);
    if (!allowed) return res.status(403).json({ error: `Requer perfil: ${roles.join(' ou ')}.` });
    next();
  };
}
