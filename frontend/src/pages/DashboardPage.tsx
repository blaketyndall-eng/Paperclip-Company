import { Card } from '../components/Card';

export function DashboardPage() {
  return (
    <main>
      <h1>Paperclip Company MVP Dashboard</h1>
      <Card title="Week 1 Status">
        <p>Repository scaffolding is complete and ready for Phase 1 implementation.</p>
      </Card>
      <Card title="Next Build Targets">
        <ul>
          <li>Google OAuth 2.0 login flow</li>
          <li>Workflow model and orchestration API</li>
          <li>Audit logging and database migrations</li>
        </ul>
      </Card>
    </main>
  );
}
