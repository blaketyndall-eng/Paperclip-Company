import express from 'express';
import pino from 'pino';
import { fileURLToPath } from 'url';
import { healthRouter } from './api/health.js';
import { authRouter } from './api/auth.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';

export const app = express();
const logger = pino({ level: env.LOG_LEVEL });

app.use(express.json());
app.use('/api', healthRouter);
app.use('/api', authRouter);
app.use(errorHandler);

export function startServer(): void {
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Backend service started');
  });
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

