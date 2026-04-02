import { env } from '../config/env.js';

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
    labelIds?: string[];
    maxResults?: number;
  }): Promise<Array<{ id: string; threadId: string }>>;
  modifyGmailLabels(input: {
    messageId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
    actorRoles: string[];
  }): Promise<{ messageId: string; updated: boolean }>;
  listDriveFiles(input: {
    folderId?: string;
    pageSize?: number;
  }): Promise<Array<{ id: string; name: string; mimeType: string }>>;
  createDriveFolder(input: {
    name: string;
    parentFolderId?: string;
    actorRoles: string[];
  }): Promise<{ id: string; name: string }>;
}

function canWriteWorkspace(roles: string[]): boolean {
  return roles.includes('admin') || roles.includes('operator');
}

export class GoogleWorkspaceApiService implements GoogleWorkspaceService {
  async listGmailMessages(input: {
    labelIds?: string[];
    maxResults?: number;
  }): Promise<Array<{ id: string; threadId: string }>> {
    if (!env.GOOGLE_WORKSPACE_ACCESS_TOKEN) {
      return [
        { id: 'mock-msg-1', threadId: 'mock-thread-1' },
        { id: 'mock-msg-2', threadId: 'mock-thread-2' }
      ];
    }

    const query = new URLSearchParams();
    query.set('maxResults', String(Math.min(input.maxResults ?? 20, 100)));
    for (const label of input.labelIds ?? []) {
      query.append('labelIds', label);
    }

    const response = await this.callWithRetries(() =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${env.GOOGLE_WORKSPACE_ACCESS_TOKEN}`
        }
      })
    );

    const payload = (await response.json()) as GmailListResponse;
    return payload.messages ?? [];
  }

  async modifyGmailLabels(input: {
    messageId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
    actorRoles: string[];
  }): Promise<{ messageId: string; updated: boolean }> {
    if (!canWriteWorkspace(input.actorRoles)) {
      throw new GoogleWorkspaceError(403, 'FORBIDDEN', 'Insufficient role for Gmail label updates');
    }

    if (!env.GOOGLE_WORKSPACE_ACCESS_TOKEN) {
      return { messageId: input.messageId, updated: true };
    }

    await this.callWithRetries(() =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${input.messageId}/modify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.GOOGLE_WORKSPACE_ACCESS_TOKEN}`
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
    folderId?: string;
    pageSize?: number;
  }): Promise<Array<{ id: string; name: string; mimeType: string }>> {
    if (!env.GOOGLE_WORKSPACE_ACCESS_TOKEN) {
      return [
        { id: 'mock-file-1', name: 'Operations Brief', mimeType: 'application/vnd.google-apps.document' },
        { id: 'mock-file-2', name: 'Weekly Metrics', mimeType: 'application/vnd.google-apps.spreadsheet' }
      ];
    }

    const query = new URLSearchParams();
    query.set('pageSize', String(Math.min(input.pageSize ?? 20, 100)));
    query.set('fields', 'files(id,name,mimeType)');
    if (input.folderId) {
      query.set('q', `'${input.folderId}' in parents`);
    }

    const response = await this.callWithRetries(() =>
      fetch(`https://www.googleapis.com/drive/v3/files?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${env.GOOGLE_WORKSPACE_ACCESS_TOKEN}`
        }
      })
    );

    const payload = (await response.json()) as DriveListResponse;
    return payload.files ?? [];
  }

  async createDriveFolder(input: {
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

    if (!env.GOOGLE_WORKSPACE_ACCESS_TOKEN) {
      return {
        id: `mock-folder-${Date.now()}`,
        name: input.name.trim()
      };
    }

    const response = await this.callWithRetries(() =>
      fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.GOOGLE_WORKSPACE_ACCESS_TOKEN}`
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
  return new GoogleWorkspaceApiService();
}
