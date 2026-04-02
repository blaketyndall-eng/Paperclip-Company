export const workflowRunStatuses = [
  'created',
  'pending_approval',
  'completed',
  'rejected',
  'failed'
] as const;

export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];

export interface Workflow {
  id: string;
  ownerId: string;
  name: string;
  template: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  triggerData: Record<string, unknown>;
  context: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAuditEvent {
  id: string;
  workflowId: string;
  runId?: string;
  actorUserId: string;
  action: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
