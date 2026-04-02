import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { getPool } from '../db/pool.js';
import { Workflow, WorkflowAuditEvent, WorkflowRun } from '../models/workflow.js';

export interface WorkflowRepository {
  createWorkflow(input: {
    ownerId: string;
    name: string;
    template: string;
  }): Promise<Workflow>;
  getWorkflowById(id: string): Promise<Workflow | undefined>;
  listWorkflowsByOwner(ownerId: string): Promise<Workflow[]>;
  createRun(input: {
    workflowId: string;
    createdBy: string;
    triggerData?: Record<string, unknown>;
    context?: Record<string, unknown>;
  }): Promise<WorkflowRun>;
  getRunById(runId: string): Promise<WorkflowRun | undefined>;
  listRuns(workflowId: string): Promise<WorkflowRun[]>;
  approveRun(runId: string, actorUserId: string, metadata?: Record<string, unknown>): Promise<WorkflowRun | undefined>;
  rejectRun(runId: string, actorUserId: string, metadata?: Record<string, unknown>): Promise<WorkflowRun | undefined>;
  listRunAuditEvents(runId: string): Promise<WorkflowAuditEvent[]>;
}

function toWorkflow(row: {
  id: string;
  owner_id: string;
  name: string;
  template: string;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
}): Workflow {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    template: row.template,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function toWorkflowRun(row: {
  id: string;
  workflow_id: string;
  status: WorkflowRun['status'];
  trigger_data: Record<string, unknown>;
  context: Record<string, unknown>;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}): WorkflowRun {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    status: row.status,
    triggerData: row.trigger_data,
    context: row.context,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function toWorkflowAuditEvent(row: {
  id: string;
  workflow_id: string;
  run_id: string | null;
  actor_user_id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}): WorkflowAuditEvent {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    runId: row.run_id ?? undefined,
    actorUserId: row.actor_user_id,
    action: row.action,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at.toISOString()
  };
}

export class PostgresWorkflowRepository implements WorkflowRepository {
  constructor(private readonly pool: Pool) {}

  async createWorkflow(input: {
    ownerId: string;
    name: string;
    template: string;
  }): Promise<Workflow> {
    const now = new Date();
    const id = randomUUID();
    const result = await this.pool.query(
      `INSERT INTO workflows (id, owner_id, name, template, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', $5, $5)
       RETURNING id, owner_id, name, template, status, created_at, updated_at`,
      [id, input.ownerId, input.name, input.template, now]
    );

    return toWorkflow(result.rows[0]);
  }

  async getWorkflowById(id: string): Promise<Workflow | undefined> {
    const result = await this.pool.query(
      `SELECT id, owner_id, name, template, status, created_at, updated_at
       FROM workflows
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    return toWorkflow(result.rows[0]);
  }

  async listWorkflowsByOwner(ownerId: string): Promise<Workflow[]> {
    const result = await this.pool.query(
      `SELECT id, owner_id, name, template, status, created_at, updated_at
       FROM workflows
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [ownerId]
    );

    return result.rows.map(toWorkflow);
  }

  async createRun(input: {
    workflowId: string;
    createdBy: string;
    triggerData?: Record<string, unknown>;
    context?: Record<string, unknown>;
  }): Promise<WorkflowRun> {
    const id = randomUUID();
    const now = new Date();
    const triggerData = input.triggerData ?? {};
    const context = input.context ?? {};

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const runResult = await client.query(
        `INSERT INTO workflow_runs (id, workflow_id, status, trigger_data, context, created_by, created_at, updated_at)
         VALUES ($1, $2, 'pending_approval', $3, $4, $5, $6, $6)
         RETURNING id, workflow_id, status, trigger_data, context, created_by, created_at, updated_at`,
        [id, input.workflowId, triggerData, context, input.createdBy, now]
      );

      await client.query(
        `INSERT INTO workflow_steps (id, run_id, step_index, step_type, input, output, status, created_at)
         VALUES ($1, $2, 1, 'draft_generation', $3, $4, 'completed', $5),
                ($6, $2, 2, 'human_approval', $7, NULL, 'pending', $5)`,
        [
          randomUUID(),
          id,
          triggerData,
          { note: 'Generated draft context for review' },
          now,
          randomUUID(),
          context
        ]
      );

      await client.query(
        `INSERT INTO workflow_audit_events (id, workflow_id, run_id, actor_user_id, action, metadata, created_at)
         VALUES ($1, $2, $3, $4, 'run_created', $5, $6)`,
        [randomUUID(), input.workflowId, id, input.createdBy, { status: 'pending_approval' }, now]
      );

      await client.query('COMMIT');
      return toWorkflowRun(runResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listRuns(workflowId: string): Promise<WorkflowRun[]> {
    const result = await this.pool.query(
      `SELECT id, workflow_id, status, trigger_data, context, created_by, created_at, updated_at
       FROM workflow_runs
       WHERE workflow_id = $1
       ORDER BY created_at DESC`,
      [workflowId]
    );

    return result.rows.map(toWorkflowRun);
  }

  async getRunById(runId: string): Promise<WorkflowRun | undefined> {
    const result = await this.pool.query(
      `SELECT id, workflow_id, status, trigger_data, context, created_by, created_at, updated_at
       FROM workflow_runs
       WHERE id = $1`,
      [runId]
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    return toWorkflowRun(result.rows[0]);
  }

  async approveRun(runId: string, actorUserId: string, metadata?: Record<string, unknown>): Promise<WorkflowRun | undefined> {
    return this.transitionRun(runId, actorUserId, 'completed', 'run_approved', metadata);
  }

  async rejectRun(runId: string, actorUserId: string, metadata?: Record<string, unknown>): Promise<WorkflowRun | undefined> {
    return this.transitionRun(runId, actorUserId, 'rejected', 'run_rejected', metadata);
  }

  private async transitionRun(
    runId: string,
    actorUserId: string,
    status: 'completed' | 'rejected',
    action: 'run_approved' | 'run_rejected',
    metadata?: Record<string, unknown>
  ): Promise<WorkflowRun | undefined> {
    const now = new Date();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const runResult = await client.query(
        `UPDATE workflow_runs
         SET status = $1,
             updated_at = $2
         WHERE id = $3
           AND status = 'pending_approval'
         RETURNING id, workflow_id, status, trigger_data, context, created_by, created_at, updated_at`,
        [status, now, runId]
      );

      if (runResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return undefined;
      }

      await client.query(
        `UPDATE workflow_steps
         SET status = $1,
             output = $2,
             acted_by = $3,
             acted_at = $4
         WHERE run_id = $5
           AND step_type = 'human_approval'`,
        [status === 'completed' ? 'completed' : 'rejected', metadata ?? null, actorUserId, now, runId]
      );

      await client.query(
        `INSERT INTO workflow_audit_events (id, workflow_id, run_id, actor_user_id, action, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), runResult.rows[0].workflow_id, runId, actorUserId, action, metadata ?? null, now]
      );

      await client.query('COMMIT');
      return toWorkflowRun(runResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listRunAuditEvents(runId: string): Promise<WorkflowAuditEvent[]> {
    const result = await this.pool.query(
      `SELECT id, workflow_id, run_id, actor_user_id, action, metadata, created_at
       FROM workflow_audit_events
       WHERE run_id = $1
       ORDER BY created_at ASC`,
      [runId]
    );

    return result.rows.map(toWorkflowAuditEvent);
  }
}

export function createWorkflowRepository(): WorkflowRepository {
  return new PostgresWorkflowRepository(getPool());
}
