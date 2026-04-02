import { Card } from '../components/Card';
import { AuthUser } from '../services/auth-api';

interface DashboardPageProps {
  user: AuthUser;
  can: (roles: string[]) => boolean;
  onLogout: () => Promise<void>;
}

export function DashboardPage({ user, can, onLogout }: DashboardPageProps) {
  return (
    <main>
      <h1>Paperclip Company MVP Dashboard</h1>
      <Card title="Signed In">
        <p>
          {user.displayName} ({user.email})
        </p>
        <p>Roles: {user.roles.join(', ')}</p>
        <button type="button" onClick={() => void onLogout()}>
          Logout
        </button>
      </Card>

      <Card title="Approvals">
        {can(['admin', 'approver']) ? (
          <button type="button">Review Pending Approvals</button>
        ) : (
          <p>Approval actions are hidden for your current role.</p>
        )}
      </Card>

      <Card title="Admin Actions">
        {can(['admin']) ? <button type="button">View Auth Audit Events</button> : <p>Admin-only controls hidden.</p>}
      </Card>

      <Card title="Current Build Targets">
        <ul>
          <li>Google Workspace connectors</li>
          <li>Queue-backed execution and LLM integration</li>
          <li>Export and observability hardening</li>
        </ul>
      </Card>
    </main>
  );
}
