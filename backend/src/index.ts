import express from 'express';
import pino from 'pino';
import { fileURLToPath } from 'url';
import { healthRouter } from './api/health.js';
import { authRouter } from './api/auth.js';
import { docsRouter } from './api/docs.js';
import { buildWorkflowRouter } from './api/workflows.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { createWorkflowRepository } from './services/workflow-repository.js';
import { createWorkflowExecutionQueue } from './services/workflow-execution-queue.js';

export const app = express();
const logger = pino({ level: env.LOG_LEVEL });
const workflowRepository = createWorkflowRepository();
const executionQueue = createWorkflowExecutionQueue(workflowRepository);

app.use(express.json());
app.use('/api', healthRouter);
app.use('/api', docsRouter);
app.use('/api', authRouter);
app.use('/api', buildWorkflowRouter(workflowRepository, executionQueue));
app.use(errorHandler);

export function startServer(): void {
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Backend service started');
  });

  const shutdown = async () => {
    await executionQueue.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });

  process.once('SIGTERM', () => {
    void shutdown();
  });
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

