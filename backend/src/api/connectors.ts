import { Response, Router } from 'express';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requireRoles } from '../middleware/rbac.js';
import {
  createGoogleWorkspaceService,
  GoogleWorkspaceError,
  GoogleWorkspaceService
} from '../services/google-workspace-service.js';

export function buildConnectorsRouter(service: GoogleWorkspaceService) {
  const connectorsRouter = Router();

  function handleError(res: Response, error: unknown): void {
    if (error instanceof GoogleWorkspaceError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected connectors service failure'
    });
  }

  connectorsRouter.get('/connectors/gmail/messages', jwtAuth, async (req, res) => {
    const labelIds =
      typeof req.query.labelIds === 'string'
        ? req.query.labelIds
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : undefined;

    const maxResults = typeof req.query.maxResults === 'string' ? Number(req.query.maxResults) : undefined;

    try {
      const messages = await service.listGmailMessages({
        labelIds,
        maxResults: Number.isFinite(maxResults) ? maxResults : undefined
      });
      res.status(200).json({ messages });
    } catch (error) {
      handleError(res, error);
    }
  });

  connectorsRouter.post(
    '/connectors/gmail/messages/:messageId/labels',
    jwtAuth,
    requireRoles(['admin', 'operator']),
    async (req, res) => {
      const auth = req.auth;
      if (!auth) {
        res.status(401).json({ error: 'Missing auth context' });
        return;
      }

      try {
        const result = await service.modifyGmailLabels({
          messageId: req.params.messageId,
          addLabelIds: Array.isArray(req.body?.addLabelIds)
            ? req.body.addLabelIds.filter((value: unknown): value is string => typeof value === 'string')
            : undefined,
          removeLabelIds: Array.isArray(req.body?.removeLabelIds)
            ? req.body.removeLabelIds.filter((value: unknown): value is string => typeof value === 'string')
            : undefined,
          actorRoles: auth.roles
        });
        res.status(200).json(result);
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  connectorsRouter.get('/connectors/drive/files', jwtAuth, async (req, res) => {
    const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : undefined;
    const pageSize = typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : undefined;

    try {
      const files = await service.listDriveFiles({
        folderId,
        pageSize: Number.isFinite(pageSize) ? pageSize : undefined
      });
      res.status(200).json({ files });
    } catch (error) {
      handleError(res, error);
    }
  });

  connectorsRouter.post('/connectors/drive/folders', jwtAuth, requireRoles(['admin', 'operator']), async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'Missing auth context' });
      return;
    }

    try {
      const folder = await service.createDriveFolder({
        name: typeof req.body?.name === 'string' ? req.body.name : '',
        parentFolderId: typeof req.body?.parentFolderId === 'string' ? req.body.parentFolderId : undefined,
        actorRoles: auth.roles
      });
      res.status(201).json({ folder });
    } catch (error) {
      handleError(res, error);
    }
  });

  return connectorsRouter;
}

export const connectorsRouter = buildConnectorsRouter(createGoogleWorkspaceService());
