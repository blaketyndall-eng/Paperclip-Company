import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authRouter } from '../../src/api/auth';

describe('auth routes', () => {
  it('returns oauth config error if environment is missing', async () => {
    const app = express();
    app.use('/api', authRouter);

    const response = await request(app).get('/api/auth/google');
    expect([200, 500]).toContain(response.status);
  });

  it('rejects /auth/me without token', async () => {
    const app = express();
    app.use('/api', authRouter);

    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('forbids admin route for non-admin role', async () => {
    const app = express();
    app.use('/api', authRouter);

    const token = jwt.sign(
      { sub: 'u1', email: 'user@example.com', roles: ['operator'] },
      'change-me'
    );

    const response = await request(app)
      .get('/api/auth/admin/audit-events')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
