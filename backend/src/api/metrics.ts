import { Router } from 'express';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { getMetricsSnapshot } from '../middleware/request-observability.js';

export const metricsRouter = Router();

metricsRouter.get('/metrics', jwtAuth, requireRoles(['admin']), (_req, res) => {
  res.status(200).json({
    generatedAt: new Date().toISOString(),
    metrics: getMetricsSnapshot()
  });
});
