import express from 'express';
import request from 'supertest';
import { docsRouter } from '../../src/api/docs';

describe('docs routes', () => {
  it('serves openapi contract json', async () => {
    const app = express();
    app.use('/api', docsRouter);

    const response = await request(app).get('/api/docs/openapi.json');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.openapi).toBe('3.0.3');
  });
});
