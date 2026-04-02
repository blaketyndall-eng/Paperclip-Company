import { Response, Router } from 'express';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { createWorkflowRepository, WorkflowRepository } from '../services/workflow-repository.js';
import { WorkflowExecutionQueue, createWorkflowExecutionQueue } from '../services/workflow-execution-queue.js';
import { WorkflowService, WorkflowServiceError } from '../services/workflow-service.js';

export function buildWorkflowRouter(repository: WorkflowRepository, executionQueue?: WorkflowExecutionQueue) {
  const workflowRouter = Router();
  const service = new WorkflowService(repository, executionQueue ?? createWorkflowExecutionQueue(repository));

  function handleError(res: Response, error: unknown): void {
    if (error instanceof WorkflowServiceError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected workflow service failure'
    });
  }

  workflowRouter.post('/workflows', jwtAuth, requireRoles(['admin', 'operator', 'approver']), async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    try {
      const workflow = await service.createWorkflow({
        ownerId: auth.sub,
        name: typeof req.body?.name === 'string' ? req.body.name.trim() : '',
        template: typeof req.body?.template === 'string' ? req.body.template.trim() : ''
      });

      res.status(201).json({ workflow });
    } catch (error) {
      handleError(res, error);
    }
  });

  workflowRouter.get('/workflows', jwtAuth, async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    const workflows = await service.listWorkflowsByOwner(auth.sub);
    res.status(200).json({ workflows });
  });

  workflowRouter.get('/workflows/:workflowId/runs', jwtAuth, async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    try {
      const runs = await service.listRuns({
        workflowId: req.params.workflowId,
        requesterUserId: auth.sub,
        requesterRoles: auth.roles
      });
      res.status(200).json({ runs });
    } catch (error) {
      handleError(res, error);
    }
  });

  workflowRouter.post('/workflows/:workflowId/execute', jwtAuth, requireRoles(['admin', 'operator', 'approver']), async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    try {
      const run = await service.executeWorkflow({
        workflowId: req.params.workflowId,
        requesterUserId: auth.sub,
        requesterRoles: auth.roles,
        triggerData: typeof req.body?.triggerData === 'object' && req.body?.triggerData !== null ? req.body.triggerData : {},
        context: typeof req.body?.context === 'object' && req.body?.context !== null ? req.body.context : {}
      });

      res.status(201).json({ run });
    } catch (error) {
      handleError(res, error);
    }
  });

  workflowRouter.put('/runs/:runId/approve', jwtAuth, requireRoles(['admin', 'approver']), async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    try {
      const approvedRun = await service.approveRun({
        runId: req.params.runId,
        actorUserId: auth.sub,
        metadata: typeof req.body?.metadata === 'object' && req.body?.metadata !== null ? req.body.metadata : undefined
      });

      res.status(200).json({ run: approvedRun });
    } catch (error) {
      handleError(res, error);
    }
  });

  workflowRouter.put('/runs/:runId/reject', jwtAuth, requireRoles(['admin', 'approver']), async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    try {
      const rejectedRun = await service.rejectRun({
        runId: req.params.runId,
        actorUserId: auth.sub,
        metadata: typeof req.body?.metadata === 'object' && req.body?.metadata !== null ? req.body.metadata : undefined
      });

      res.status(200).json({ run: rejectedRun });
    } catch (error) {
      handleError(res, error);
    }
  });

  workflowRouter.get('/runs/:runId/audit', jwtAuth, async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    try {
      const events = await service.listRunAuditEvents({
        runId: req.params.runId,
        requesterUserId: auth.sub,
        requesterRoles: auth.roles
      });
      res.status(200).json({ events });
    } catch (error) {
      handleError(res, error);
    }
  });

  workflowRouter.post('/runs/:runId/export', jwtAuth, async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    try {
      const exportPayload = await service.exportRun({
        runId: req.params.runId,
        requesterUserId: auth.sub,
        requesterRoles: auth.roles
      });

      res.status(200).json({
        fileName: `run-${req.params.runId}-export.json`,
        export: exportPayload
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  return workflowRouter;
}

export const workflowRouter = buildWorkflowRouter(createWorkflowRepository());
