export const roles = ['admin', 'approver', 'operator', 'viewer'] as const;
export type Role = (typeof roles)[number];

export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  googleId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  refreshToken: string;
  expiresAt: string;
  createdAt: string;
}

export interface GoogleWorkspaceToken {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthAuditEvent {
  id: string;
  userId: string;
  action: 'login' | 'logout' | 'refresh' | 'role_change';
  metadata?: Record<string, string>;
  createdAt: string;
}
