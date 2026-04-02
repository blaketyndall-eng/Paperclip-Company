import { randomUUID } from 'crypto';
import { GoogleWorkspaceToken, Role, Session, User } from '../../src/models/auth.js';
import { AuthRepository, CreateGoogleUserInput } from '../../src/services/auth-repository.js';

export class InMemoryAuthRepository implements AuthRepository {
  private users = new Map<string, User>();
  private sessions = new Map<string, Session>();
  private googleWorkspaceTokens = new Map<string, GoogleWorkspaceToken>();
  private auditEvents: Array<{
    id: string;
    userId: string;
    action: string;
    metadata: Record<string, string> | undefined;
    createdAt: string;
  }> = [];

  async findUserByGoogleId(googleId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.googleId === googleId);
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.email === email);
  }

  async findUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async upsertGoogleUser(input: CreateGoogleUserInput): Promise<User> {
    const existing = (await this.findUserByGoogleId(input.googleId)) ?? (await this.findUserByEmail(input.email));
    const now = new Date().toISOString();

    if (existing) {
      const updated: User = {
        ...existing,
        email: input.email,
        displayName: input.displayName,
        googleId: input.googleId,
        updatedAt: now
      };
      this.users.set(updated.id, updated);
      return updated;
    }

    const created: User = {
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      googleId: input.googleId,
      roles: ['operator'] as Role[],
      createdAt: now,
      updatedAt: now
    };

    this.users.set(created.id, created);
    return created;
  }

  async createSession(session: Session): Promise<Session> {
    this.sessions.set(session.id, session);
    return session;
  }

  async getSessionByRefreshToken(refreshToken: string): Promise<Session | undefined> {
    return Array.from(this.sessions.values()).find((session) => session.refreshToken === refreshToken);
  }

  async rotateSessionRefreshToken(input: {
    sessionId: string;
    refreshToken: string;
    expiresAt: string;
  }): Promise<Session | undefined> {
    const existing = this.sessions.get(input.sessionId);
    if (!existing) {
      return undefined;
    }

    const updated: Session = {
      ...existing,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt
    };

    this.sessions.set(input.sessionId, updated);
    return updated;
  }

  async deleteSessionByRefreshToken(refreshToken: string): Promise<boolean> {
    const session = await this.getSessionByRefreshToken(refreshToken);
    if (!session) {
      return false;
    }

    this.sessions.delete(session.id);
    return true;
  }

  async upsertGoogleWorkspaceToken(input: {
    userId: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt: string;
    scope?: string;
  }): Promise<GoogleWorkspaceToken> {
    const existing = this.googleWorkspaceTokens.get(input.userId);
    const now = new Date().toISOString();
    const refreshToken = input.refreshToken ?? existing?.refreshToken;

    if (!refreshToken) {
      throw new Error('refreshToken is required when creating initial Google workspace token');
    }

    const token: GoogleWorkspaceToken = {
      id: existing?.id ?? randomUUID(),
      userId: input.userId,
      accessToken: input.accessToken,
      refreshToken,
      expiresAt: input.expiresAt,
      scope: input.scope,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    this.googleWorkspaceTokens.set(input.userId, token);
    return token;
  }

  async getGoogleWorkspaceTokenByUserId(userId: string): Promise<GoogleWorkspaceToken | undefined> {
    return this.googleWorkspaceTokens.get(userId);
  }

  async addAuditEvent(event: {
    userId: string;
    action: 'login' | 'logout' | 'refresh' | 'role_change';
    metadata?: Record<string, string>;
  }): Promise<void> {
    this.auditEvents.push({
      id: randomUUID(),
      userId: event.userId,
      action: event.action,
      metadata: event.metadata,
      createdAt: new Date().toISOString()
    });
  }

  async listAuditEvents(userId?: string): Promise<Array<{
    id: string;
    userId: string;
    action: string;
    metadata: Record<string, string> | undefined;
    createdAt: string;
  }>> {
    if (!userId) {
      return this.auditEvents;
    }
    return this.auditEvents.filter((event) => event.userId === userId);
  }
}
