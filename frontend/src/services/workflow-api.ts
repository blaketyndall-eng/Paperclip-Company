"use client";

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
  status: 'created' | 'pending_approval' | 'completed' | 'rejected' | 'failed';
  triggerData: Record<string, unknown>;
  context: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
}

export async function listWorkflows(token: string): Promise<Workflow[]> {
  const response = await fetch(`${apiBaseUrl}/workflows`, {
    headers: authHeaders(token)
  });
  const data = await parseJson<{ workflows: Workflow[] }>(response);
  return data.workflows;
}

export async function createWorkflow(token: string, input: { name: string; template: string }): Promise<Workflow> {
  const response = await fetch(`${apiBaseUrl}/workflows`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(input)
  });
  const data = await parseJson<{ workflow: Workflow }>(response);
  return data.workflow;
}

export async function listWorkflowRuns(token: string, workflowId: string): Promise<WorkflowRun[]> {
  const response = await fetch(`${apiBaseUrl}/workflows/${workflowId}/runs`, {
    headers: authHeaders(token)
  });
  const data = await parseJson<{ runs: WorkflowRun[] }>(response);
  return data.runs;
}

export async function executeWorkflow(token: string, workflowId: string, payload: {
  triggerData?: Record<string, unknown>;
  context?: Record<string, unknown>;
}): Promise<WorkflowRun> {
  const response = await fetch(`${apiBaseUrl}/workflows/${workflowId}/execute`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const data = await parseJson<{ run: WorkflowRun }>(response);
  return data.run;
}

export async function approveRun(token: string, runId: string): Promise<WorkflowRun> {
  const response = await fetch(`${apiBaseUrl}/runs/${runId}/approve`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ metadata: { approvedAt: new Date().toISOString() } })
  });
  const data = await parseJson<{ run: WorkflowRun }>(response);
  return data.run;
}

export async function rejectRun(token: string, runId: string): Promise<WorkflowRun> {
  const response = await fetch(`${apiBaseUrl}/runs/${runId}/reject`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ metadata: { rejectedAt: new Date().toISOString() } })
  });
  const data = await parseJson<{ run: WorkflowRun }>(response);
  return data.run;
}

export async function exportRun(token: string, runId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${apiBaseUrl}/runs/${runId}/export`, {
    method: 'POST',
    headers: authHeaders(token)
  });
  return parseJson<Record<string, unknown>>(response);
}
