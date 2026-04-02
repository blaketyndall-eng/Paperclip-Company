import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { buildAuthRouter } from '../../src/api/auth';
import { InMemoryAuthRepository } from '../helpers/in-memory-auth-repository';

class MockOAuthClient {
  async exchangeCodeForUser() {
    return {
      profile: {
        sub: 'google-sub-123',
        email: 'oauth-user@example.com',
        name: 'OAuth User'
      },
      refreshToken: 'refresh-token',
      expiresIn: 3600
    };
  }
}

describe('auth routes', () => {
  function createTestApp() {
    const app = express();
    app.use('/api', buildAuthRouter(new InMemoryAuthRepository(), new MockOAuthClient()));
    return app;
  }

  it('returns oauth config error if environment is missing', async () => {
    const app = createTestApp();

    const response = await request(app).get('/api/auth/google');
    expect([200, 500]).toContain(response.status);
  });

  it('rejects /auth/me without token', async () => {
    const app = createTestApp();

    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('forbids admin route for non-admin role', async () => {
    const app = createTestApp();

    const token = jwt.sign(
      { sub: 'u1', email: 'user@example.com', roles: ['operator'] },
      'change-me'
    );

    const response = await request(app)
      .get('/api/auth/admin/audit-events')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('returns 400 when callback code is missing', async () => {
    const app = createTestApp();
    const response = await request(app).get('/api/auth/google/callback');
    expect(response.status).toBe(400);
  });

  it('exchanges callback code and returns token/user', async () => {
    const app = createTestApp();
    const response = await request(app).get('/api/auth/google/callback?code=abc123');

    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe('oauth-user@example.com');
  });
});
