"use client";

import React from 'react';
import {
  approveRun,
  createWorkflow,
  executeWorkflow,
  exportRun,
  listWorkflowRuns,
  listWorkflows,
  rejectRun,
  Workflow,
  WorkflowRun
} from '../services/workflow-api';
import { Card } from '../components/Card';
import { AuthUser } from '../services/auth-api';

interface DashboardViewProps {
  user: AuthUser;
  token: string;
  can: (roles: string[]) => boolean;
  onLogout: () => Promise<void>;
}

export function DashboardView({ user, token, can, onLogout }: DashboardViewProps) {
  const [workflows, setWorkflows] = React.useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = React.useState<string>('');
  const [runs, setRuns] = React.useState<WorkflowRun[]>([]);
  const [statusMessage, setStatusMessage] = React.useState<string>('');
  const [loading, setLoading] = React.useState<boolean>(false);

  const selectedWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId);

  const refreshWorkflows = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await listWorkflows(token);
      setWorkflows(list);
      if (list.length > 0 && !selectedWorkflowId) {
        setSelectedWorkflowId(list[0].id);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, [token, selectedWorkflowId]);

  const refreshRuns = React.useCallback(async () => {
    if (!selectedWorkflowId) {
      setRuns([]);
      return;
    }

    setLoading(true);
    try {
      const list = await listWorkflowRuns(token, selectedWorkflowId);
      setRuns(list);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to load workflow runs');
    } finally {
      setLoading(false);
    }
  }, [token, selectedWorkflowId]);

  React.useEffect(() => {
    void refreshWorkflows();
  }, [refreshWorkflows]);

  React.useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  async function onCreateWorkflow(): Promise<void> {
    setLoading(true);
    setStatusMessage('');
    try {
      await createWorkflow(token, {
        name: `Ops Workflow ${new Date().toLocaleTimeString()}`,
        template: 'ops_template_v1'
      });
      setStatusMessage('Workflow created');
      await refreshWorkflows();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Workflow creation failed');
    } finally {
      setLoading(false);
    }
  }

  async function onExecuteWorkflow(): Promise<void> {
    if (!selectedWorkflowId) {
      return;
    }

    setLoading(true);
    setStatusMessage('');
    try {
      await executeWorkflow(token, selectedWorkflowId, {
        triggerData: { source: 'gmail' },
        context: { customerId: 'UI-DEMO' }
      });
      setStatusMessage('Workflow run started');
      await refreshRuns();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Workflow execution failed');
    } finally {
      setLoading(false);
    }
  }

  async function onApprove(runId: string): Promise<void> {
    setLoading(true);
    setStatusMessage('');
    try {
      await approveRun(token, runId);
      setStatusMessage('Run approved');
      await refreshRuns();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Approval failed');
    } finally {
      setLoading(false);
    }
  }

  async function onReject(runId: string): Promise<void> {
    setLoading(true);
    setStatusMessage('');
    try {
      await rejectRun(token, runId);
      setStatusMessage('Run rejected');
      await refreshRuns();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Rejection failed');
    } finally {
      setLoading(false);
    }
  }

  async function onExport(runId: string): Promise<void> {
    setLoading(true);
    setStatusMessage('');
    try {
      const payload = await exportRun(token, runId);
      setStatusMessage(`Export ready: ${JSON.stringify(payload).slice(0, 120)}...`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <h1 className="mb-6 text-4xl font-semibold tracking-tight">Paperclip Company MVP Dashboard</h1>
      <Card title="Signed In">
        <p className="text-slate-800">
          {user.displayName} ({user.email})
        </p>
        <p className="mt-2 text-slate-700">Roles: {user.roles.join(', ')}</p>
        <button
          className="mt-4 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          type="button"
          onClick={() => void onLogout()}
        >
          Logout
        </button>
      </Card>

      <Card title="Approvals">
        {can(['admin', 'approver']) ? (
          <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500" type="button">
            Review Pending Approvals
          </button>
        ) : (
          <p className="text-slate-700">Approval actions are hidden for your current role.</p>
        )}
      </Card>

      <Card title="Admin Actions">
        {can(['admin']) ? (
          <button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500" type="button">
            View Auth Audit Events
          </button>
        ) : (
          <p className="text-slate-700">Admin-only controls hidden.</p>
        )}
      </Card>

      <Card title="Current Build Targets">
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li>Google Workspace connectors</li>
          <li>Queue-backed execution and LLM integration</li>
          <li>Export and observability hardening</li>
        </ul>
      </Card>

      <Card title="Workflows">
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500"
            type="button"
            onClick={() => void onCreateWorkflow()}
            disabled={loading}
          >
            Create Workflow
          </button>
          <button
            className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50"
            type="button"
            onClick={() => void onExecuteWorkflow()}
            disabled={!selectedWorkflowId || loading}
          >
            Execute Selected Workflow
          </button>
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-slate-700" htmlFor="workflow-select">
            Workflow
          </label>
          <select
            id="workflow-select"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={selectedWorkflowId}
            onChange={(event) => {
              setSelectedWorkflowId(event.target.value);
            }}
          >
            <option value="">Select workflow</option>
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-3 text-sm text-slate-600">
          {selectedWorkflow ? `Selected template: ${selectedWorkflow.template}` : 'No workflow selected'}
        </p>
      </Card>

      <Card title="Workflow Runs">
        {runs.length === 0 ? <p className="text-slate-700">No runs yet for selected workflow.</p> : null}
        <div className="space-y-3">
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-900">Run {run.id}</p>
              <p className="text-sm text-slate-600">Status: {run.status}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {run.status === 'pending_approval' && can(['admin', 'approver']) ? (
                  <>
                    <button
                      className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white"
                      type="button"
                      onClick={() => void onApprove(run.id)}
                    >
                      Approve
                    </button>
                    <button
                      className="rounded bg-rose-600 px-2 py-1 text-xs font-medium text-white"
                      type="button"
                      onClick={() => void onReject(run.id)}
                    >
                      Reject
                    </button>
                  </>
                ) : null}
                <button
                  className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white"
                  type="button"
                  onClick={() => void onExport(run.id)}
                >
                  Export
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {statusMessage ? <p className="mt-4 text-sm text-slate-800">{statusMessage}</p> : null}
    </main>
  );
}
