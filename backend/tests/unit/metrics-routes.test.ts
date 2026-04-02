import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { metricsRouter } from '../../src/api/metrics';
import { observabilityMiddleware } from '../../src/middleware/request-observability';

function tokenFor(sub: string, roles: string[]) {
  return jwt.sign({ sub, email: `${sub}@example.com`, roles }, 'change-me');
}

describe('metrics route', () => {
  it('returns metrics snapshot for admin', async () => {
    const app = express();
    app.use(observabilityMiddleware);
    app.get('/api/ping', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.use('/api', metricsRouter);

    await request(app).get('/api/ping');

    const response = await request(app)
      .get('/api/metrics')
      .set('Authorization', `Bearer ${tokenFor('admin1', ['admin'])}`);

    expect(response.status).toBe(200);
    expect(response.body.metrics.totalRequests).toBeGreaterThan(0);
  });
});
