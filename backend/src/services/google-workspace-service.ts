import { env } from '../config/env.js';
import { AuthRepository, createAuthRepository } from './auth-repository.js';

export class GoogleWorkspaceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
}

interface DriveListResponse {
  files?: Array<{ id: string; name: string; mimeType: string }>;
}

export interface GoogleWorkspaceService {
  listGmailMessages(input: {
    requesterUserId: string;
    labelIds?: string[];
    maxResults?: number;
  }): Promise<Array<{ id: string; threadId: string }>>;
  modifyGmailLabels(input: {
    requesterUserId: string;
    messageId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
    actorRoles: string[];
  }): Promise<{ messageId: string; updated: boolean }>;
  listDriveFiles(input: {
    requesterUserId: string;
    folderId?: string;
    pageSize?: number;
  }): Promise<Array<{ id: string; name: string; mimeType: string }>>;
  createDriveFolder(input: {
    requesterUserId: string;
    name: string;
    parentFolderId?: string;
    actorRoles: string[];
  }): Promise<{ id: string; name: string }>;
}

function canWriteWorkspace(roles: string[]): boolean {
  return roles.includes('admin') || roles.includes('operator');
}

export class GoogleWorkspaceApiService implements GoogleWorkspaceService {
  constructor(private readonly authRepository: AuthRepository) {}

  async listGmailMessages(input: {
    requesterUserId: string;
    labelIds?: string[];
    maxResults?: number;
  }): Promise<Array<{ id: string; threadId: string }>> {
    const accessToken = await this.getValidAccessToken(input.requesterUserId);

    const query = new URLSearchParams();
    query.set('maxResults', String(Math.min(input.maxResults ?? 20, 100)));
    for (const label of input.labelIds ?? []) {
      query.append('labelIds', label);
    }

    const response = await this.callWithRetries(() =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })
    );

    const payload = (await response.json()) as GmailListResponse;
    return payload.messages ?? [];
  }

  async modifyGmailLabels(input: {
    requesterUserId: string;
    messageId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
    actorRoles: string[];
  }): Promise<{ messageId: string; updated: boolean }> {
    if (!canWriteWorkspace(input.actorRoles)) {
      throw new GoogleWorkspaceError(403, 'FORBIDDEN', 'Insufficient role for Gmail label updates');
    }

    const accessToken = await this.getValidAccessToken(input.requesterUserId);

    await this.callWithRetries(() =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${input.messageId}/modify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          addLabelIds: input.addLabelIds ?? [],
          removeLabelIds: input.removeLabelIds ?? []
        })
      })
    );

    return { messageId: input.messageId, updated: true };
  }

  async listDriveFiles(input: {
    requesterUserId: string;
    folderId?: string;
    pageSize?: number;
  }): Promise<Array<{ id: string; name: string; mimeType: string }>> {
    const accessToken = await this.getValidAccessToken(input.requesterUserId);

    const query = new URLSearchParams();
    query.set('pageSize', String(Math.min(input.pageSize ?? 20, 100)));
    query.set('fields', 'files(id,name,mimeType)');
    if (input.folderId) {
      query.set('q', `'${input.folderId}' in parents`);
    }

    const response = await this.callWithRetries(() =>
      fetch(`https://www.googleapis.com/drive/v3/files?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      })
    );

    const payload = (await response.json()) as DriveListResponse;
    return payload.files ?? [];
  }

  async createDriveFolder(input: {
    requesterUserId: string;
    name: string;
    parentFolderId?: string;
    actorRoles: string[];
  }): Promise<{ id: string; name: string }> {
    if (!canWriteWorkspace(input.actorRoles)) {
      throw new GoogleWorkspaceError(403, 'FORBIDDEN', 'Insufficient role for Drive write operations');
    }

    if (!input.name.trim()) {
      throw new GoogleWorkspaceError(400, 'INVALID_INPUT', 'Folder name is required');
    }

    const accessToken = await this.getValidAccessToken(input.requesterUserId);

    const response = await this.callWithRetries(() =>
      fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          name: input.name.trim(),
          mimeType: 'application/vnd.google-apps.folder',
          ...(input.parentFolderId ? { parents: [input.parentFolderId] } : {})
        })
      })
    );

    const payload = (await response.json()) as { id: string; name: string };
    return {
      id: payload.id,
      name: payload.name
    };
  }

  private async getValidAccessToken(userId: string): Promise<string> {
    const token = await this.authRepository.getGoogleWorkspaceTokenByUserId(userId);
    if (!token) {
      throw new GoogleWorkspaceError(
        412,
        'GOOGLE_TOKEN_NOT_CONNECTED',
        'Google Workspace token is not connected for this user'
      );
    }

    const expiresAtMs = new Date(token.expiresAt).getTime();
    const nowWithSkewMs = Date.now() + 60_000;
    if (expiresAtMs > nowWithSkewMs) {
      return token.accessToken;
    }

    const refreshed = await this.refreshAccessToken(token.userId, token.refreshToken);
    return refreshed.accessToken;
  }

  private async refreshAccessToken(userId: string, refreshToken: string) {
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new GoogleWorkspaceError(500, 'GOOGLE_OAUTH_NOT_CONFIGURED', 'Google OAuth client is not configured');
    }

    const response = await this.callWithRetries(() =>
      fetch(env.GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }).toString()
      })
    );

    const payload = (await response.json()) as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
      scope?: string;
    };

    if (!payload.access_token) {
      throw new GoogleWorkspaceError(502, 'GOOGLE_REFRESH_FAILED', 'Google token refresh response missing access token');
    }

    return this.authRepository.upsertGoogleWorkspaceToken({
      userId,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + (payload.expires_in ?? 3600) * 1000).toISOString(),
      scope: payload.scope
    });
  }

  private async callWithRetries(execute: () => Promise<Response>): Promise<Response> {
    let lastError: unknown = undefined;

    for (let attempt = 1; attempt <= env.GOOGLE_API_MAX_RETRIES; attempt += 1) {
      try {
        const response = await execute();
        if (!response.ok) {
          if (response.status === 403) {
            throw new GoogleWorkspaceError(403, 'GOOGLE_PERMISSION_DENIED', await response.text());
          }
          if (response.status >= 400 && response.status < 500) {
            throw new GoogleWorkspaceError(response.status, 'GOOGLE_CLIENT_ERROR', await response.text());
          }
          throw new Error(`Google API request failed with status ${response.status}`);
        }

        return response;
      } catch (error) {
        lastError = error;
        if (error instanceof GoogleWorkspaceError && error.statusCode < 500) {
          throw error;
        }

        if (attempt === env.GOOGLE_API_MAX_RETRIES) {
          break;
        }

        const backoffMs = 250 * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    if (lastError instanceof GoogleWorkspaceError) {
      throw lastError;
    }

    throw new GoogleWorkspaceError(502, 'GOOGLE_API_UNAVAILABLE', 'Google connector call failed after retries');
  }
}

export function createGoogleWorkspaceService(): GoogleWorkspaceService {
  return new GoogleWorkspaceApiService(createAuthRepository());
}
