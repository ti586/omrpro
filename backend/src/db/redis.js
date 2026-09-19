// src/db/redis.js
import { Redis } from 'ioredis';
import { logger } from './logger.js';

export let redis;

export async function connectRedis() {
  redis = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
  await redis.connect();
  await redis.ping();
  logger.info('Redis conectado');
}
