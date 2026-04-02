import { Workflow, WorkflowAuditEvent, WorkflowRun } from '../models/workflow.js';
import { WorkflowRepository } from './workflow-repository.js';

export class WorkflowServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export class WorkflowService {
  constructor(private readonly repository: WorkflowRepository) {}

  async createWorkflow(input: {
    ownerId: string;
    name: string;
    template: string;
  }): Promise<Workflow> {
    if (!input.name.trim() || !input.template.trim()) {
      throw new WorkflowServiceError(400, 'INVALID_INPUT', 'name and template are required');
    }

    return this.repository.createWorkflow(input);
  }

  async listWorkflowsByOwner(ownerId: string): Promise<Workflow[]> {
    return this.repository.listWorkflowsByOwner(ownerId);
  }

  async listRuns(input: {
    workflowId: string;
    requesterUserId: string;
    requesterRoles: string[];
  }): Promise<WorkflowRun[]> {
    const workflow = await this.repository.getWorkflowById(input.workflowId);
    if (!workflow) {
      throw new WorkflowServiceError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found');
    }

    const canAccess = workflow.ownerId === input.requesterUserId || input.requesterRoles.includes('admin');
    if (!canAccess) {
      throw new WorkflowServiceError(403, 'FORBIDDEN', 'Cannot view runs for this workflow');
    }

    return this.repository.listRuns(input.workflowId);
  }

  async executeWorkflow(input: {
    workflowId: string;
    requesterUserId: string;
    requesterRoles: string[];
    triggerData?: Record<string, unknown>;
    context?: Record<string, unknown>;
  }): Promise<WorkflowRun> {
    const workflow = await this.repository.getWorkflowById(input.workflowId);
    if (!workflow) {
      throw new WorkflowServiceError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found');
    }

    const canExecute = workflow.ownerId === input.requesterUserId || input.requesterRoles.includes('admin');
    if (!canExecute) {
      throw new WorkflowServiceError(403, 'FORBIDDEN', 'Cannot execute this workflow');
    }

    return this.repository.createRun({
      workflowId: input.workflowId,
      createdBy: input.requesterUserId,
      triggerData: input.triggerData,
      context: input.context
    });
  }

  async approveRun(input: {
    runId: string;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }): Promise<WorkflowRun> {
    const existingRun = await this.repository.getRunById(input.runId);
    if (!existingRun) {
      throw new WorkflowServiceError(404, 'RUN_NOT_FOUND', 'Run not found');
    }

    if (existingRun.status !== 'pending_approval') {
      throw new WorkflowServiceError(
        409,
        'INVALID_RUN_STATE',
        `Run cannot be approved from status: ${existingRun.status}`
      );
    }

    const run = await this.repository.approveRun(input.runId, input.actorUserId, input.metadata);
    if (!run) {
      throw new WorkflowServiceError(404, 'RUN_NOT_FOUND', 'Run not found');
    }

    return run;
  }

  async rejectRun(input: {
    runId: string;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }): Promise<WorkflowRun> {
    const existingRun = await this.repository.getRunById(input.runId);
    if (!existingRun) {
      throw new WorkflowServiceError(404, 'RUN_NOT_FOUND', 'Run not found');
    }

    if (existingRun.status !== 'pending_approval') {
      throw new WorkflowServiceError(
        409,
        'INVALID_RUN_STATE',
        `Run cannot be rejected from status: ${existingRun.status}`
      );
    }

    const run = await this.repository.rejectRun(input.runId, input.actorUserId, input.metadata);
    if (!run) {
      throw new WorkflowServiceError(404, 'RUN_NOT_FOUND', 'Run not found');
    }

    return run;
  }

  async listRunAuditEvents(input: {
    runId: string;
    requesterUserId: string;
    requesterRoles: string[];
  }): Promise<WorkflowAuditEvent[]> {
    const run = await this.repository.getRunById(input.runId);
    if (!run) {
      throw new WorkflowServiceError(404, 'RUN_NOT_FOUND', 'Run not found');
    }

    const workflow = await this.repository.getWorkflowById(run.workflowId);
    if (!workflow) {
      throw new WorkflowServiceError(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found');
    }

    const canAccess = workflow.ownerId === input.requesterUserId || input.requesterRoles.includes('admin');
    if (!canAccess) {
      throw new WorkflowServiceError(403, 'FORBIDDEN', 'Cannot view audit events for this run');
    }

    return this.repository.listRunAuditEvents(input.runId);
  }
}
