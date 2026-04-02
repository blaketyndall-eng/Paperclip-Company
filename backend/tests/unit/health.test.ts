import request from 'supertest';
import express from 'express';
import { healthRouter } from '../../src/api/health';

describe('health endpoint', () => {
  it('returns service status', async () => {
    const app = express();
    app.use('/api', healthRouter);

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
