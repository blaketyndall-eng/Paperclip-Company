import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { jwtAuth } from '../../src/middleware/jwt-auth';
import { requireRoles } from '../../src/middleware/rbac';

describe('jwt + rbac middleware', () => {
  const app = express();

  app.get('/secure', jwtAuth, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get('/admin', jwtAuth, requireRoles(['admin']), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  it('returns 401 when token is missing', async () => {
    const response = await request(app).get('/secure');
    expect(response.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    const token = jwt.sign(
      { sub: 'u1', email: 'user@example.com', roles: ['operator'] },
      'change-me'
    );

    const response = await request(app)
      .get('/secure')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it('returns 403 for missing required role', async () => {
    const token = jwt.sign(
      { sub: 'u1', email: 'user@example.com', roles: ['operator'] },
      'change-me'
    );

    const response = await request(app)
      .get('/admin')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
