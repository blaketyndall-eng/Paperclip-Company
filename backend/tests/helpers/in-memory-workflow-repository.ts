import { randomUUID } from 'crypto';
import { Workflow, WorkflowAuditEvent, WorkflowRun } from '../../src/models/workflow.js';
import { WorkflowRepository } from '../../src/services/workflow-repository.js';

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private workflows = new Map<string, Workflow>();
  private runs = new Map<string, WorkflowRun>();
  private auditByRun = new Map<string, WorkflowAuditEvent[]>();

  async createWorkflow(input: { ownerId: string; name: string; template: string }): Promise<Workflow> {
    const now = new Date().toISOString();
    const workflow: Workflow = {
      id: randomUUID(),
      ownerId: input.ownerId,
      name: input.name,
      template: input.template,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  async getWorkflowById(id: string): Promise<Workflow | undefined> {
    return this.workflows.get(id);
  }

  async listWorkflowsByOwner(ownerId: string): Promise<Workflow[]> {
    return Array.from(this.workflows.values()).filter((w) => w.ownerId === ownerId);
  }

  async createRun(input: {
    workflowId: string;
    createdBy: string;
    triggerData?: Record<string, unknown>;
    context?: Record<string, unknown>;
  }): Promise<WorkflowRun> {
    const now = new Date().toISOString();
    const run: WorkflowRun = {
      id: randomUUID(),
      workflowId: input.workflowId,
      status: 'pending_approval',
      triggerData: input.triggerData ?? {},
      context: input.context ?? {},
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now
    };

    this.runs.set(run.id, run);
    this.appendAudit(run.id, {
      id: randomUUID(),
      workflowId: run.workflowId,
      runId: run.id,
      actorUserId: input.createdBy,
      action: 'run_created',
      metadata: { status: run.status },
      createdAt: now
    });

    return run;
  }

  async listRuns(workflowId: string): Promise<WorkflowRun[]> {
    return Array.from(this.runs.values()).filter((r) => r.workflowId === workflowId);
  }

  async approveRun(runId: string, actorUserId: string, metadata?: Record<string, unknown>): Promise<WorkflowRun | undefined> {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }

    const updated: WorkflowRun = {
      ...run,
      status: 'completed',
      updatedAt: new Date().toISOString()
    };
    this.runs.set(runId, updated);
    this.appendAudit(runId, {
      id: randomUUID(),
      workflowId: updated.workflowId,
      runId,
      actorUserId,
      action: 'run_approved',
      metadata,
      createdAt: updated.updatedAt
    });
    return updated;
  }

  async rejectRun(runId: string, actorUserId: string, metadata?: Record<string, unknown>): Promise<WorkflowRun | undefined> {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }

    const updated: WorkflowRun = {
      ...run,
      status: 'rejected',
      updatedAt: new Date().toISOString()
    };
    this.runs.set(runId, updated);
    this.appendAudit(runId, {
      id: randomUUID(),
      workflowId: updated.workflowId,
      runId,
      actorUserId,
      action: 'run_rejected',
      metadata,
      createdAt: updated.updatedAt
    });
    return updated;
  }

  async listRunAuditEvents(runId: string): Promise<WorkflowAuditEvent[]> {
    return this.auditByRun.get(runId) ?? [];
  }

  private appendAudit(runId: string, event: WorkflowAuditEvent): void {
    const existing = this.auditByRun.get(runId) ?? [];
    existing.push(event);
    this.auditByRun.set(runId, existing);
  }
}
