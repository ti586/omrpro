// src/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { logger } from './db/logger.js';
import { connectDB } from './db/pool.js';
import { connectRedis } from './db/redis.js';
import authRoutes     from './routes/auth.js';
import schoolRoutes   from './routes/schools.js';
import examRoutes     from './routes/exams.js';
import questionRoutes from './routes/questions.js';
import cardRoutes     from './routes/cards.js';
import omrRoutes      from './routes/omr.js';
import reportRoutes   from './routes/reports.js';
import studentRoutes  from './routes/students.js';
import classRoutes    from './routes/classes.js';
import subjectRoutes  from './routes/subjects.js';

export { logger };

const app = express();
const httpServer = createServer(app);

export const io = new IOServer(httpServer, {
  cors: { origin: process.env.FRONTEND_URL ?? '*', credentials: true },
});
io.on('connection', (socket) => {
  socket.on('join:exam', (examId) => socket.join(`exam:${examId}`));
});

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas requisicoes. Tente novamente em 15 minutos.' },
}));

const v1 = '/api/v1';
app.use(`${v1}/auth`,      authRoutes);
app.use(`${v1}/schools`,   schoolRoutes);
app.use(`${v1}/exams`,     examRoutes);
app.use(`${v1}/questions`, questionRoutes);
app.use(`${v1}/cards`,     cardRoutes);
app.use(`${v1}/omr`,       omrRoutes);
app.use(`${v1}/reports`,   reportRoutes);
app.use(`${v1}/students`,  studentRoutes);
app.use(`${v1}/classes`,   classRoutes);
app.use(`${v1}/subjects`,  subjectRoutes);

app.get('/health', (_, res) => res.json({
  status: 'ok', service: 'omrpro-api', version: '1.0.0',
  timestamp: new Date().toISOString(),
}));

app.use((req, res) => res.status(404).json({ error: `Rota nao encontrada: ${req.method} ${req.path}` }));

app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Unhandled error');
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' && status === 500
      ? 'Erro interno do servidor' : err.message,
  });
});

const PORT = process.env.PORT ?? 4000;
async function start() {
  await connectDB();
  await connectRedis();
  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`OMR·Pro API rodando na porta ${PORT}`);
  });
}
start().catch(err => { logger.error(err, 'Falha ao iniciar'); process.exit(1); });
