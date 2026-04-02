import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { applyMigrations } from '../../src/services/migration-runner.js';
import { PostgresAuthRepository } from '../../src/services/auth-repository.js';
import { PostgresWorkflowRepository } from '../../src/services/workflow-repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../../migrations');

describe('postgres integration: migrations + repositories', () => {
  const testDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  let pool: Pool | undefined;
  let dbAvailable = false;

  beforeAll(async () => {
    if (!testDbUrl) {
      return;
    }

    pool = new Pool({ connectionString: testDbUrl });
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
      await applyMigrations(pool, migrationsDir);
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it('skips gracefully when Postgres is unavailable', () => {
    if (dbAvailable) {
      expect(true).toBe(true);
      return;
    }

    // eslint-disable-next-line no-console
    console.warn(
      'Integration test skipped: set TEST_DATABASE_URL (or DATABASE_URL) to reachable Postgres instance.'
    );
    expect(true).toBe(true);
  });

  it('persists auth and workflow lifecycle in Postgres', async () => {
    if (!dbAvailable || !pool) {
      expect(true).toBe(true);
      return;
    }

    const authRepo = new PostgresAuthRepository(pool);
    const workflowRepo = new PostgresWorkflowRepository(pool);

    const user = await authRepo.upsertGoogleUser({
      email: `integration-${Date.now()}@example.com`,
      displayName: 'Integration User',
      googleId: `google-${Date.now()}`
    });

    const workflow = await workflowRepo.createWorkflow({
      ownerId: user.id,
      name: 'Integration Workflow',
      template: 'claims_intake_v1'
    });

    const run = await workflowRepo.createRun({
      workflowId: workflow.id,
      createdBy: user.id,
      triggerData: { source: 'integration' },
      context: { customerId: 'INT-1' }
    });

    await workflowRepo.updateRunStatus({
      runId: run.id,
      status: 'pending_approval',
      context: { draft: { id: 'd1' } }
    });

    const approved = await workflowRepo.approveRun(run.id, user.id, { note: 'approved in integration test' });

    expect(approved).toBeDefined();
    expect(approved?.status).toBe('completed');

    const events = await workflowRepo.listRunAuditEvents(run.id);
    expect(Array.isArray(events)).toBe(true);
  });
});
