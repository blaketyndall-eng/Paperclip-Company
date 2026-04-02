import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { buildWorkflowRouter } from '../../src/api/workflows';
import { InMemoryWorkflowRepository } from '../helpers/in-memory-workflow-repository';

function tokenFor(sub: string, roles: string[]) {
  return jwt.sign({ sub, email: `${sub}@example.com`, roles }, 'change-me');
}

describe('workflow happy path e2e', () => {
  it('runs trigger -> draft -> approve -> export over HTTP API', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', buildWorkflowRouter(new InMemoryWorkflowRepository()));

    const operatorToken = tokenFor('owner-e2e-1', ['operator']);
    const approverToken = tokenFor('approver-e2e-1', ['approver']);

    const createWorkflow = await request(app)
      .post('/api/workflows')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ name: 'E2E Flow', template: 'e2e_template_v1' });

    expect(createWorkflow.status).toBe(201);
    const workflowId = createWorkflow.body.workflow.id as string;

    const executeRun = await request(app)
      .post(`/api/workflows/${workflowId}/execute`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ triggerData: { source: 'gmail' }, context: { customerId: 'C-E2E' } });

    expect(executeRun.status).toBe(201);
    const runId = executeRun.body.run.id as string;

    const approveRun = await request(app)
      .put(`/api/runs/${runId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .send({ metadata: { approvedBy: 'qa' } });

    expect(approveRun.status).toBe(200);
    expect(approveRun.body.run.status).toBe('completed');

    const exportRun = await request(app)
      .post(`/api/runs/${runId}/export`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(exportRun.status).toBe(200);
    expect(exportRun.body.export.run.id).toBe(runId);
    expect(Array.isArray(exportRun.body.export.steps)).toBe(true);
    expect(Array.isArray(exportRun.body.export.auditEvents)).toBe(true);
  });
});
