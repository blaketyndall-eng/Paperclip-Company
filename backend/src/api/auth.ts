import { randomUUID } from 'crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { createAuthRepository, AuthRepository } from '../services/auth-repository.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { Session } from '../models/auth.js';

interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
}

interface ExchangeResult {
  profile: GoogleProfile;
  refreshToken?: string;
  expiresIn?: number;
}

interface OAuthClient {
  exchangeCodeForUser(code: string): Promise<ExchangeResult>;
}

class GoogleOAuthClient implements OAuthClient {
  async exchangeCodeForUser(code: string): Promise<ExchangeResult> {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      throw new Error('Google OAuth environment variables are not configured');
    }

    const tokenBody = new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const tokenResponse = await fetch(env.GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenBody.toString()
    });

    if (!tokenResponse.ok) {
      const details = await tokenResponse.text();
      throw new Error(`Google token exchange failed: ${details}`);
    }

    const tokenPayload = (await tokenResponse.json()) as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
    };

    const profileResponse = await fetch(env.GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`
      }
    });

    if (!profileResponse.ok) {
      const details = await profileResponse.text();
      throw new Error(`Google userinfo fetch failed: ${details}`);
    }

    const profile = (await profileResponse.json()) as GoogleProfile;
    if (!profile.sub || !profile.email) {
      throw new Error('Google userinfo response missing required fields');
    }

    return {
      profile,
      refreshToken: tokenPayload.refresh_token,
      expiresIn: tokenPayload.expires_in
    };
  }
}

export function buildAuthRouter(
  repository: AuthRepository,
  oauthClient: OAuthClient = new GoogleOAuthClient()
) {
  const authRouter = Router();

  authRouter.get('/auth/google', (_req, res) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_REDIRECT_URI) {
      res.status(500).json({
        error: 'Google OAuth environment variables are not configured'
      });
      return;
    }

    const scope = ['openid', 'email', 'profile'].join(' ');

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent'
    });

    res.status(200).json({
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    });
  });

  authRouter.get('/auth/google/callback', async (req, res) => {
    const code = req.query.code;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    try {
      const exchange = await oauthClient.exchangeCodeForUser(code);
      const user = await repository.upsertGoogleUser({
        email: exchange.profile.email,
        displayName: exchange.profile.name ?? exchange.profile.email,
        googleId: exchange.profile.sub
      });

      const now = new Date();
      const session: Session = {
        id: randomUUID(),
        userId: user.id,
        refreshToken: exchange.refreshToken ?? randomUUID(),
        expiresAt: new Date(now.getTime() + (exchange.expiresIn ?? 3600) * 1000).toISOString(),
        createdAt: now.toISOString()
      };

      await repository.createSession(session);
      await repository.addAuditEvent({
        userId: user.id,
        action: 'login',
        metadata: {
          provider: 'google'
        }
      });

      const token = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          roles: user.roles
        },
        env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.status(200).json({
        token,
        refreshToken: session.refreshToken,
        user
      });
    } catch (error) {
      res.status(502).json({
        error: 'OAuth callback processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  authRouter.get('/auth/me', jwtAuth, (req, res) => {
    res.status(200).json({
      user: req.auth
    });
  });

  authRouter.post('/auth/refresh', async (req, res) => {
    const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
    if (!refreshToken) {
      res.status(400).json({ error: 'Missing refresh token' });
      return;
    }

    const session = await repository.getSessionByRefreshToken(refreshToken);
    if (!session) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await repository.deleteSessionByRefreshToken(refreshToken);
      res.status(401).json({ error: 'Refresh token expired' });
      return;
    }

    const user = await repository.findUserById(session.userId);
    if (!user) {
      await repository.deleteSessionByRefreshToken(refreshToken);
      res.status(401).json({ error: 'User for refresh token no longer exists' });
      return;
    }

    const now = new Date();
    const nextRefreshToken = randomUUID();
    const refreshedSession = await repository.rotateSessionRefreshToken({
      sessionId: session.id,
      refreshToken: nextRefreshToken,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    });

    if (!refreshedSession) {
      res.status(500).json({ error: 'Unable to rotate refresh token' });
      return;
    }

    await repository.addAuditEvent({
      userId: user.id,
      action: 'refresh',
      metadata: { sessionId: refreshedSession.id }
    });

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles
      },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      token,
      refreshToken: refreshedSession.refreshToken,
      user
    });
  });

  authRouter.post('/auth/logout', async (req, res) => {
    const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : '';
    if (!refreshToken) {
      res.status(400).json({ error: 'Missing refresh token' });
      return;
    }

    const session = await repository.getSessionByRefreshToken(refreshToken);
    const removed = await repository.deleteSessionByRefreshToken(refreshToken);

    if (removed && session) {
      await repository.addAuditEvent({
        userId: session.userId,
        action: 'logout',
        metadata: { sessionId: session.id }
      });
    }

    res.status(200).json({ loggedOut: true });
  });

  authRouter.get('/auth/admin/audit-events', jwtAuth, requireRoles(['admin']), async (req, res) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const events = await repository.listAuditEvents(userId);
    res.status(200).json({ events });
  });

  return authRouter;
}

export const authRouter = buildAuthRouter(createAuthRepository());
