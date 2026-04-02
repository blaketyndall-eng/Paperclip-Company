import { Router } from 'express';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { createWorkflowRepository, WorkflowRepository } from '../services/workflow-repository.js';

export function buildWorkflowRouter(repository: WorkflowRepository) {
  const workflowRouter = Router();

  workflowRouter.post('/workflows', jwtAuth, requireRoles(['admin', 'operator', 'approver']), async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const template = typeof req.body?.template === 'string' ? req.body.template.trim() : '';

    if (!name || !template) {
      res.status(400).json({ error: 'name and template are required' });
      return;
    }

    const workflow = await repository.createWorkflow({
      ownerId: auth.sub,
      name,
      template
    });

    res.status(201).json({ workflow });
  });

  workflowRouter.get('/workflows', jwtAuth, async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    const workflows = await repository.listWorkflowsByOwner(auth.sub);
    res.status(200).json({ workflows });
  });

  workflowRouter.get('/workflows/:workflowId/runs', jwtAuth, async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    const workflow = await repository.getWorkflowById(req.params.workflowId);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    if (workflow.ownerId !== auth.sub && !auth.roles.includes('admin')) {
      res.status(403).json({ error: 'Cannot view runs for this workflow' });
      return;
    }

    const runs = await repository.listRuns(req.params.workflowId);
    res.status(200).json({ runs });
  });

  workflowRouter.post('/workflows/:workflowId/execute', jwtAuth, requireRoles(['admin', 'operator', 'approver']), async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    const workflow = await repository.getWorkflowById(req.params.workflowId);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    if (workflow.ownerId !== auth.sub && !auth.roles.includes('admin')) {
      res.status(403).json({ error: 'Cannot execute this workflow' });
      return;
    }

    const run = await repository.createRun({
      workflowId: req.params.workflowId,
      createdBy: auth.sub,
      triggerData: typeof req.body?.triggerData === 'object' && req.body?.triggerData !== null ? req.body.triggerData : {},
      context: typeof req.body?.context === 'object' && req.body?.context !== null ? req.body.context : {}
    });

    res.status(201).json({ run });
  });

  workflowRouter.put('/runs/:runId/approve', jwtAuth, requireRoles(['admin', 'approver']), async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    const approvedRun = await repository.approveRun(
      req.params.runId,
      auth.sub,
      typeof req.body?.metadata === 'object' && req.body?.metadata !== null ? req.body.metadata : undefined
    );

    if (!approvedRun) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.status(200).json({ run: approvedRun });
  });

  workflowRouter.put('/runs/:runId/reject', jwtAuth, requireRoles(['admin', 'approver']), async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    const rejectedRun = await repository.rejectRun(
      req.params.runId,
      auth.sub,
      typeof req.body?.metadata === 'object' && req.body?.metadata !== null ? req.body.metadata : undefined
    );

    if (!rejectedRun) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.status(200).json({ run: rejectedRun });
  });

  workflowRouter.get('/runs/:runId/audit', jwtAuth, async (req, res) => {
    const events = await repository.listRunAuditEvents(req.params.runId);
    res.status(200).json({ events });
  });

  return workflowRouter;
}

export const workflowRouter = buildWorkflowRouter(createWorkflowRepository());
