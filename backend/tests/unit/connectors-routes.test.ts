import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { buildConnectorsRouter } from '../../src/api/connectors';
import { GoogleWorkspaceError, GoogleWorkspaceService } from '../../src/services/google-workspace-service';

class MockGoogleWorkspaceService implements GoogleWorkspaceService {
  async listGmailMessages(_input: {
    requesterUserId: string;
    labelIds?: string[];
    maxResults?: number;
  }) {
    return [{ id: 'm1', threadId: 't1' }];
  }

  async modifyGmailLabels(input: {
    requesterUserId: string;
    messageId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
    actorRoles: string[];
  }) {
    if (!input.actorRoles.includes('operator') && !input.actorRoles.includes('admin')) {
      throw new GoogleWorkspaceError(403, 'FORBIDDEN', 'Insufficient role for Gmail label updates');
    }
    return { messageId: input.messageId, updated: true };
  }

  async listDriveFiles(_input: {
    requesterUserId: string;
    folderId?: string;
    pageSize?: number;
  }) {
    return [{ id: 'f1', name: 'Doc', mimeType: 'application/vnd.google-apps.document' }];
  }

  async createDriveFolder(input: {
    requesterUserId: string;
    name: string;
    parentFolderId?: string;
    actorRoles: string[];
  }) {
    if (!input.actorRoles.includes('operator') && !input.actorRoles.includes('admin')) {
      throw new GoogleWorkspaceError(403, 'FORBIDDEN', 'Insufficient role for Drive write operations');
    }
    return { id: 'folder-1', name: input.name };
  }
}

function tokenFor(sub: string, roles: string[]) {
  return jwt.sign({ sub, email: `${sub}@example.com`, roles }, 'change-me');
}

describe('connectors routes', () => {
  function createApp() {
    const app = express();
    app.use(express.json());
    app.use('/api', buildConnectorsRouter(new MockGoogleWorkspaceService()));
    return app;
  }

  it('lists gmail messages for authenticated user', async () => {
    const app = createApp();
    const response = await request(app)
      .get('/api/connectors/gmail/messages?labelIds=INBOX,IMPORTANT&maxResults=10')
      .set('Authorization', `Bearer ${tokenFor('user1', ['viewer'])}`);

    expect(response.status).toBe(200);
    expect(response.body.messages.length).toBe(1);
  });

  it('blocks gmail label update for non-operator role', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/connectors/gmail/messages/msg-1/labels')
      .set('Authorization', `Bearer ${tokenFor('user2', ['viewer'])}`)
      .send({ addLabelIds: ['Label_123'] });

    expect(response.status).toBe(403);
  });

  it('creates drive folder for operator', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/connectors/drive/folders')
      .set('Authorization', `Bearer ${tokenFor('operator1', ['operator'])}`)
      .send({ name: 'Workflow Outputs' });

    expect(response.status).toBe(201);
    expect(response.body.folder.id).toBe('folder-1');
  });
});
