import express from 'express';
import pino from 'pino';
import { healthRouter } from './api/health.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';

export const app = express();
const logger = pino({ level: env.LOG_LEVEL });

app.use(express.json());
app.use('/api', healthRouter);
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Backend service started');
});
