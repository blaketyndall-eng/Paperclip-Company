import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { Role, Session, User, roles } from '../models/auth.js';
import { getPool } from '../db/pool.js';

export interface CreateGoogleUserInput {
  email: string;
  displayName: string;
  googleId: string;
}

export interface AuthRepository {
  findUserByGoogleId(googleId: string): Promise<User | undefined>;
  findUserByEmail(email: string): Promise<User | undefined>;
  findUserById(id: string): Promise<User | undefined>;
  upsertGoogleUser(input: CreateGoogleUserInput): Promise<User>;
  createSession(session: Session): Promise<Session>;
  getSessionByRefreshToken(refreshToken: string): Promise<Session | undefined>;
  rotateSessionRefreshToken(input: {
    sessionId: string;
    refreshToken: string;
    expiresAt: string;
  }): Promise<Session | undefined>;
  deleteSessionByRefreshToken(refreshToken: string): Promise<boolean>;
  addAuditEvent(event: {
    userId: string;
    action: 'login' | 'logout' | 'refresh' | 'role_change';
    metadata?: Record<string, string>;
  }): Promise<void>;
  listAuditEvents(userId?: string): Promise<Array<{
    id: string;
    userId: string;
    action: string;
    metadata: Record<string, string> | undefined;
    createdAt: string;
  }>>;
}

function toRoleArray(input: string[]): Role[] {
  return input.filter((role): role is Role => roles.includes(role as Role));
}

function toUser(row: {
  id: string;
  email: string;
  display_name: string;
  google_id: string | null;
  roles: string[];
  created_at: Date;
  updated_at: Date;
}): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    googleId: row.google_id ?? undefined,
    roles: toRoleArray(row.roles),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool) {}

  async findUserById(id: string): Promise<User | undefined> {
    const result = await this.pool.query(
      `SELECT id, email, display_name, google_id, roles, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    return toUser(result.rows[0]);
  }

  async findUserByGoogleId(googleId: string): Promise<User | undefined> {
    const result = await this.pool.query(
      `SELECT id, email, display_name, google_id, roles, created_at, updated_at
       FROM users
       WHERE google_id = $1`,
      [googleId]
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    return toUser(result.rows[0]);
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.pool.query(
      `SELECT id, email, display_name, google_id, roles, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    return toUser(result.rows[0]);
  }

  async upsertGoogleUser(input: CreateGoogleUserInput): Promise<User> {
    const now = new Date();
    const existingByGoogle = await this.findUserByGoogleId(input.googleId);

    if (existingByGoogle) {
      const result = await this.pool.query(
        `UPDATE users
         SET email = $1,
             display_name = $2,
             updated_at = $3
         WHERE id = $4
         RETURNING id, email, display_name, google_id, roles, created_at, updated_at`,
        [input.email, input.displayName, now, existingByGoogle.id]
      );
      return toUser(result.rows[0]);
    }

    const existingByEmail = await this.findUserByEmail(input.email);
    if (existingByEmail) {
      const result = await this.pool.query(
        `UPDATE users
         SET google_id = $1,
             display_name = $2,
             updated_at = $3
         WHERE id = $4
         RETURNING id, email, display_name, google_id, roles, created_at, updated_at`,
        [input.googleId, input.displayName, now, existingByEmail.id]
      );
      return toUser(result.rows[0]);
    }

    const id = randomUUID();
    const result = await this.pool.query(
      `INSERT INTO users (id, email, display_name, google_id, roles, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id, email, display_name, google_id, roles, created_at, updated_at`,
      [id, input.email, input.displayName, input.googleId, ['operator'], now]
    );

    return toUser(result.rows[0]);
  }

  async createSession(session: Session): Promise<Session> {
    await this.pool.query(
      `INSERT INTO sessions (id, user_id, refresh_token, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [session.id, session.userId, session.refreshToken, session.expiresAt, session.createdAt]
    );
    return session;
  }

  async getSessionByRefreshToken(refreshToken: string): Promise<Session | undefined> {
    const result = await this.pool.query(
      `SELECT id, user_id, refresh_token, expires_at, created_at
       FROM sessions
       WHERE refresh_token = $1`,
      [refreshToken]
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      refreshToken: row.refresh_token,
      expiresAt: row.expires_at.toISOString(),
      createdAt: row.created_at.toISOString()
    };
  }

  async rotateSessionRefreshToken(input: {
    sessionId: string;
    refreshToken: string;
    expiresAt: string;
  }): Promise<Session | undefined> {
    const result = await this.pool.query(
      `UPDATE sessions
       SET refresh_token = $1,
           expires_at = $2
       WHERE id = $3
       RETURNING id, user_id, refresh_token, expires_at, created_at`,
      [input.refreshToken, input.expiresAt, input.sessionId]
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      refreshToken: row.refresh_token,
      expiresAt: row.expires_at.toISOString(),
      createdAt: row.created_at.toISOString()
    };
  }

  async deleteSessionByRefreshToken(refreshToken: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM sessions
       WHERE refresh_token = $1`,
      [refreshToken]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async addAuditEvent(event: {
    userId: string;
    action: 'login' | 'logout' | 'refresh' | 'role_change';
    metadata?: Record<string, string>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_audit_events (id, user_id, action, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), event.userId, event.action, event.metadata ?? null, new Date()]
    );
  }

  async listAuditEvents(userId?: string): Promise<Array<{
    id: string;
    userId: string;
    action: string;
    metadata: Record<string, string> | undefined;
    createdAt: string;
  }>> {
    const result = userId
      ? await this.pool.query(
          `SELECT id, user_id, action, metadata, created_at
           FROM auth_audit_events
           WHERE user_id = $1
           ORDER BY created_at DESC`,
          [userId]
        )
      : await this.pool.query(
          `SELECT id, user_id, action, metadata, created_at
           FROM auth_audit_events
           ORDER BY created_at DESC`
        );

    return result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      metadata: row.metadata ?? undefined,
      createdAt: row.created_at.toISOString()
    }));
  }
}

export function createAuthRepository(): AuthRepository {
  return new PostgresAuthRepository(getPool());
}
