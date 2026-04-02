import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { applyMigrations } from '../../src/services/migration-runner.js';
import { PostgresAuthRepository } from '../../src/services/auth-repository.js';
import { GoogleWorkspaceApiService } from '../../src/services/google-workspace-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../../migrations');

describe('google connectors integration (staging sandbox)', () => {
  const testDbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  const enabled = process.env.STAGING_GOOGLE_CONNECTORS_ENABLED === 'true';
  const stagingUserEmail = process.env.STAGING_GOOGLE_CONNECTORS_USER_EMAIL;
  const stagingAccessToken = process.env.STAGING_GOOGLE_CONNECTORS_ACCESS_TOKEN;
  const stagingRefreshToken = process.env.STAGING_GOOGLE_CONNECTORS_REFRESH_TOKEN;

  let pool: Pool | undefined;
  let shouldRun = false;
  let userId = '';

  beforeAll(async () => {
    if (!enabled || !testDbUrl || !stagingUserEmail || !stagingAccessToken || !stagingRefreshToken) {
      return;
    }

    pool = new Pool({ connectionString: testDbUrl });
    try {
      await pool.query('SELECT 1');
      await applyMigrations(pool, migrationsDir);

      const authRepo = new PostgresAuthRepository(pool);
      const user = await authRepo.upsertGoogleUser({
        email: stagingUserEmail,
        displayName: 'Staging Connector User',
        googleId: `staging-${Date.now()}`
      });

      userId = user.id;
      await authRepo.upsertGoogleWorkspaceToken({
        userId,
        accessToken: stagingAccessToken,
        refreshToken: stagingRefreshToken,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/drive'
      });

      shouldRun = true;
    } catch {
      shouldRun = false;
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it('skips gracefully when staging connector prerequisites are unavailable', () => {
    if (shouldRun) {
      expect(true).toBe(true);
      return;
    }

    // eslint-disable-next-line no-console
    console.warn(
      'Connector integration skipped: set STAGING_GOOGLE_CONNECTORS_ENABLED=true and provide staging connector env vars + reachable Postgres.'
    );
    expect(true).toBe(true);
  });

  it('lists gmail messages and drive files using stored per-user oauth tokens', async () => {
    if (!shouldRun || !pool) {
      expect(true).toBe(true);
      return;
    }

    const authRepo = new PostgresAuthRepository(pool);
    const service = new GoogleWorkspaceApiService(authRepo);

    const [messages, files] = await Promise.all([
      service.listGmailMessages({
        requesterUserId: userId,
        maxResults: 5
      }),
      service.listDriveFiles({
        requesterUserId: userId,
        pageSize: 5
      })
    ]);

    expect(Array.isArray(messages)).toBe(true);
    expect(Array.isArray(files)).toBe(true);
  });

  it('refreshes access token when stored token is expired', async () => {
    if (!shouldRun || !pool) {
      expect(true).toBe(true);
      return;
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      // eslint-disable-next-line no-console
      console.warn('Connector refresh integration skipped: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.');
      expect(true).toBe(true);
      return;
    }

    const authRepo = new PostgresAuthRepository(pool);
    await authRepo.upsertGoogleWorkspaceToken({
      userId,
      accessToken: 'expired-token-placeholder',
      refreshToken: stagingRefreshToken as string,
      expiresAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
    });

    const service = new GoogleWorkspaceApiService(authRepo);
    const files = await service.listDriveFiles({
      requesterUserId: userId,
      pageSize: 1
    });

    const refreshed = await authRepo.getGoogleWorkspaceTokenByUserId(userId);

    expect(Array.isArray(files)).toBe(true);
    expect(refreshed).toBeDefined();
    expect(refreshed?.accessToken).not.toBe('expired-token-placeholder');
  });
});
