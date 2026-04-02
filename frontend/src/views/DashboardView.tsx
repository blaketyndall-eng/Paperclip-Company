"use client";

import React from 'react';
import { Card } from '../components/Card';
import { AuthUser } from '../services/auth-api';

interface DashboardViewProps {
  user: AuthUser;
  can: (roles: string[]) => boolean;
  onLogout: () => Promise<void>;
}

export function DashboardView({ user, can, onLogout }: DashboardViewProps) {
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
    </main>
  );
}
