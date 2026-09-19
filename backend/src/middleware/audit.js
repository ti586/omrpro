// src/middleware/audit.js
import { db } from '../db/pool.js';

export function auditLog(action) {
  return async (req, _res, next) => {
    try {
      const body = { ...req.body };
      delete body.password; delete body.password_hash; delete body.refreshToken;
      await db.query(
        `INSERT INTO audit_logs (user_id, action, entity, ip_address, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user?.id ?? null, action, req.params?.id ?? null, req.ip, JSON.stringify(body)]
      );
    } catch (_) {}
    next();
  };
}
