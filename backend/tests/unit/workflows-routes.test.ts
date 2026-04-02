import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { buildWorkflowRouter } from '../../src/api/workflows';
import { InMemoryWorkflowRepository } from '../helpers/in-memory-workflow-repository';

function tokenFor(sub: string, roles: string[]) {
  return jwt.sign({ sub, email: `${sub}@example.com`, roles }, 'change-me');
}

describe('workflow routes', () => {
  function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api', buildWorkflowRouter(new InMemoryWorkflowRepository()));
    return app;
  }

  it('creates workflow for operator', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${tokenFor('user-1', ['operator'])}`)
      .send({ name: 'Claims Intake', template: 'claims_intake_v1' });

    expect(response.status).toBe(201);
    expect(response.body.workflow.name).toBe('Claims Intake');
  });

  it('executes workflow and creates pending run', async () => {
    const app = createApp();
    const ownerToken = tokenFor('owner-1', ['operator']);

    const workflowResponse = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Claims Intake', template: 'claims_intake_v1' });

    const runResponse = await request(app)
      .post(`/api/workflows/${workflowResponse.body.workflow.id}/execute`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ triggerData: { source: 'gmail' }, context: { customerId: 'C-1' } });

    expect(runResponse.status).toBe(201);
    expect(runResponse.body.run.status).toBe('pending_approval');
  });

  it('requires approver role for approve endpoint', async () => {
    const app = createApp();
    const ownerToken = tokenFor('owner-2', ['operator']);

    const workflowResponse = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Vendor Intake', template: 'vendor_intake_v1' });

    const runResponse = await request(app)
      .post(`/api/workflows/${workflowResponse.body.workflow.id}/execute`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    const approvalResponse = await request(app)
      .put(`/api/runs/${runResponse.body.run.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ metadata: { reason: 'ok' } });

    expect(approvalResponse.status).toBe(403);
  });

  it('approves run for approver role and returns audit trail', async () => {
    const app = createApp();
    const ownerToken = tokenFor('owner-3', ['operator']);
    const approverToken = tokenFor('approver-1', ['approver']);

    const workflowResponse = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Onboarding', template: 'onboarding_v1' });

    const runResponse = await request(app)
      .post(`/api/workflows/${workflowResponse.body.workflow.id}/execute`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    const approveResponse = await request(app)
      .put(`/api/runs/${runResponse.body.run.id}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ metadata: { quality: 'approved' } });

    expect(approveResponse.status).toBe(200);
    expect(approveResponse.body.run.status).toBe('completed');

    const auditResponse = await request(app)
      .get(`/api/runs/${runResponse.body.run.id}/audit`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(auditResponse.status).toBe(200);
    expect(auditResponse.body.events.length).toBeGreaterThanOrEqual(2);
  });

  it('returns 409 when approving already-completed run', async () => {
    const app = createApp();
    const ownerToken = tokenFor('owner-4', ['operator']);
    const approverToken = tokenFor('approver-2', ['approver']);

    const workflowResponse = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Claims Intake', template: 'claims_intake_v1' });

    const runResponse = await request(app)
      .post(`/api/workflows/${workflowResponse.body.workflow.id}/execute`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    const firstApprove = await request(app)
      .put(`/api/runs/${runResponse.body.run.id}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({});

    expect(firstApprove.status).toBe(200);

    const secondApprove = await request(app)
      .put(`/api/runs/${runResponse.body.run.id}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({});

    expect(secondApprove.status).toBe(409);
    expect(secondApprove.body.error).toBe('INVALID_RUN_STATE');
  });
});
