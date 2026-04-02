import { randomUUID } from 'crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Role, User } from '../models/auth.js';
import { authStore } from '../services/auth-store.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requireRoles } from '../middleware/rbac.js';

export const authRouter = Router();

authRouter.get('/auth/google', (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
    res.status(500).json({
      error: 'Google OAuth environment variables are not configured'
    });
    return;
  }

  const scope = [
    'openid',
    'email',
    'profile'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent'
  });

  res.status(200).json({
    message: 'OAuth skeleton ready: redirect client to URL below',
    authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  });
});

authRouter.get('/auth/google/callback', (req, res) => {
  const code = req.query.code;

  // Week 2 skeleton: we validate callback shape and stub user/session creation.
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }

  const demoRoles: Role[] = ['operator'];
  const now = new Date().toISOString();

  const user: User = {
    id: randomUUID(),
    email: 'oauth-user@example.com',
    displayName: 'OAuth User',
    roles: demoRoles,
    createdAt: now,
    updatedAt: now
  };

  authStore.upsertUser(user);

  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      roles: user.roles
    },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  authStore.addAuditEvent({
    id: randomUUID(),
    userId: user.id,
    action: 'login',
    createdAt: now
  });

  res.status(200).json({
    message: 'OAuth callback skeleton executed',
    token,
    user
  });
});

authRouter.get('/auth/me', jwtAuth, (req, res) => {
  res.status(200).json({
    user: req.auth
  });
});

authRouter.get('/auth/admin/audit-events', jwtAuth, requireRoles(['admin']), (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  res.status(200).json({
    events: authStore.listAuditEvents(userId)
  });
});
