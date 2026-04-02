import { Queue, Worker } from 'bullmq';
import { env } from '../config/env.js';
import { WorkflowExecutionService } from './workflow-execution-service.js';
import { WorkflowRepository } from './workflow-repository.js';

export interface WorkflowExecutionJob {
  runId: string;
  actorUserId: string;
}

export interface WorkflowExecutionQueue {
  enqueue(job: WorkflowExecutionJob): Promise<void>;
  close(): Promise<void>;
}

const QUEUE_NAME = 'workflow-execution';

export class InlineWorkflowExecutionQueue implements WorkflowExecutionQueue {
  constructor(private readonly executionService: WorkflowExecutionService) {}

  async enqueue(job: WorkflowExecutionJob): Promise<void> {
    await this.executionService.executeRunById(job.runId, job.actorUserId);
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

export class BullWorkflowExecutionQueue implements WorkflowExecutionQueue {
  private readonly queue: Queue<WorkflowExecutionJob>;
  private readonly worker: Worker<WorkflowExecutionJob>;
  private readonly connection: { host: string; port: number; password?: string };

  constructor(private readonly executionService: WorkflowExecutionService) {
    const redisUrl = new URL(env.REDIS_URL);
    this.connection = {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || '6379'),
      ...(redisUrl.password ? { password: redisUrl.password } : {})
    };

    this.queue = new Queue<WorkflowExecutionJob>(QUEUE_NAME, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 500
        }
      }
    });

    this.worker = new Worker<WorkflowExecutionJob>(
      QUEUE_NAME,
      async (job) => {
        await this.executionService.executeRunById(job.data.runId, job.data.actorUserId);
      },
      {
        connection: this.connection,
        concurrency: 4
      }
    );
  }

  async enqueue(job: WorkflowExecutionJob): Promise<void> {
    await this.queue.add('execute-workflow-run', job);
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

export function createWorkflowExecutionQueue(repository: WorkflowRepository): WorkflowExecutionQueue {
  const executionService = new WorkflowExecutionService(repository);

  if (env.WORKFLOW_EXECUTION_MODE === 'bull') {
    return new BullWorkflowExecutionQueue(executionService);
  }

  return new InlineWorkflowExecutionQueue(executionService);
}
