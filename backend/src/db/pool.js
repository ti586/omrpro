// src/db/pool.js
import pg from 'pg';
import { logger } from './logger.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => logger.error({ err }, 'PostgreSQL pool error'));

export const db = pool;

export async function connectDB() {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  logger.info('PostgreSQL conectado');
}
