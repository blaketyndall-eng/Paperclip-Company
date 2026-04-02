import { randomUUID } from 'crypto';
import { Workflow, WorkflowAuditEvent, WorkflowRun, WorkflowStep, WorkflowStepStatus } from '../../src/models/workflow.js';
import { WorkflowRepository } from '../../src/services/workflow-repository.js';

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private workflows = new Map<string, Workflow>();
  private runs = new Map<string, WorkflowRun>();
  private stepsByRun = new Map<string, WorkflowStep[]>();
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
      status: 'created',
      triggerData: input.triggerData ?? {},
      context: input.context ?? {},
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now
    };

    this.runs.set(run.id, run);
    this.stepsByRun.set(run.id, [
      {
        id: randomUUID(),
        runId: run.id,
        stepIndex: 1,
        stepType: 'draft_generation',
        input: run.triggerData,
        status: 'pending',
        createdAt: now
      }
    ]);

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

  async createStep(input: {
    runId: string;
    stepIndex: number;
    stepType: string;
    input: Record<string, unknown>;
    output?: Record<string, unknown>;
    status: WorkflowStepStatus;
  }): Promise<WorkflowStep> {
    const step: WorkflowStep = {
      id: randomUUID(),
      runId: input.runId,
      stepIndex: input.stepIndex,
      stepType: input.stepType,
      input: input.input,
      output: input.output,
      status: input.status,
      createdAt: new Date().toISOString()
    };

    const steps = this.stepsByRun.get(input.runId) ?? [];
    steps.push(step);
    this.stepsByRun.set(input.runId, steps);
    return step;
  }

  async updateStepStatus(input: {
    runId: string;
    stepType: string;
    status: WorkflowStepStatus;
    output?: Record<string, unknown>;
    actedBy?: string;
  }): Promise<WorkflowStep | undefined> {
    const steps = this.stepsByRun.get(input.runId) ?? [];
    const target = steps.find((step) => step.stepType === input.stepType);
    if (!target) {
      return undefined;
    }

    target.status = input.status;
    target.output = input.output;
    target.actedBy = input.actedBy;
    target.actedAt = input.actedBy ? new Date().toISOString() : undefined;
    return target;
  }

  async updateRunStatus(input: {
    runId: string;
    status: WorkflowRun['status'];
    context?: Record<string, unknown>;
  }): Promise<WorkflowRun | undefined> {
    const run = this.runs.get(input.runId);
    if (!run) {
      return undefined;
    }

    const updated: WorkflowRun = {
      ...run,
      status: input.status,
      context: input.context ? { ...run.context, ...input.context } : run.context,
      updatedAt: new Date().toISOString()
    };

    this.runs.set(input.runId, updated);
    return updated;
  }

  async appendRunAuditEvent(input: {
    runId: string;
    actorUserId: string;
    action: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const run = this.runs.get(input.runId);
    if (!run) {
      return;
    }

    this.appendAudit(input.runId, {
      id: randomUUID(),
      workflowId: run.workflowId,
      runId: input.runId,
      actorUserId: input.actorUserId,
      action: input.action,
      metadata: input.metadata,
      createdAt: new Date().toISOString()
    });
  }

  async getRunById(runId: string): Promise<WorkflowRun | undefined> {
    return this.runs.get(runId);
  }

  async listRunSteps(runId: string): Promise<WorkflowStep[]> {
    return this.stepsByRun.get(runId) ?? [];
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
    await this.updateStepStatus({
      runId,
      stepType: 'human_approval',
      status: 'completed',
      output: metadata,
      actedBy: actorUserId
    });
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
    await this.updateStepStatus({
      runId,
      stepType: 'human_approval',
      status: 'rejected',
      output: metadata,
      actedBy: actorUserId
    });
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
