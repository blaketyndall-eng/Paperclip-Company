# Testing Strategy & Quality Assurance

**Coverage Target:** 80%+ on critical paths | **Test Types:** Unit, Integration, E2E | **Automation Level:** 100%

---

## Testing Philosophy

1. **Test Critical Paths First:** Focus on user flows and data integrity
2. **Fail Fast:** Tests run in CI on every commit
3. **Real-World Scenarios:** Use realistic data and edge cases
4. **No Manual Testing:** Automate everything; manual QA is for exploration
5. **Observability:** Tests log what they're testing so failures are debuggable

---

## Test Pyramid

```
         /\
        /E2E\           3-5 tests
       /─────\          (full workflows)
      /       \
     /Integration\     15-20 tests
    /──────────────\   (API, connectors, database)
   /               \
  /Unit Tests       \  50-80 tests
 /──────────────────\ (functions, classes)
```

---

## Unit Tests (60% of suite)

**Framework:** Jest | **Coverage:** 80%+ critical logic

**Test Areas:**

### 1. Workflow Orchestration
```typescript
// src/services/workflow-executor.spec.ts

describe('WorkflowExecutor', () => {
  describe('execute', () => {
    it('should execute all steps in order', async () => {
      const executor = new WorkflowExecutor();
      const run = createMockRun({
        workflow_id: 'workflow_1',
        steps: [{ id: 'step_1', type: 'extract' }, { id: 'step_2', type: 'draft' }]
      });
      
      await executor.execute(run);
      
      expect(run.status).toBe('COMPLETED');
      expect(run.context.step_1).toBeDefined();
      expect(run.context.step_2).toBeDefined();
    });
    
    it('should handle approval step correctly', async () => {
      const executor = new WorkflowExecutor();
      const run = createMockRun({
        steps: [{ id: 'step_1', type: 'approval', approver_role: 'approver' }]
      });
      
      await executor.execute(run);
      
      expect(run.status).toBe('PENDING_APPROVAL');
      expect(run.pending_approval_step_id).toBe('step_1');
    });
    
    it('should not proceed after rejection', async () => {
      const executor = new WorkflowExecutor();
      const run = createMockRun({
        status: 'PENDING_APPROVAL',
        pending_approval_step_id: 'step_1',
        current_request: { status: 'rejected' }
      });
      
      await executor.execute(run);
      
      expect(run.status).toContain('ERROR');
    });
    
    it('should retry failed steps with backoff', async () => {
      const executor = new WorkflowExecutor();
      const service = jest.spyOn(executor, 'executeStep')
        .mockRejectedValueOnce(new Error('Network'))
        .mockResolvedValueOnce({ data: 'ok' });
      
      const run = createMockRun();
      await executor.execute(run);
      
      expect(service).toHaveBeenCalledTimes(2);  // original + retry
    });
    
    it('should log all steps to audit trail', async () => {
      const executor = new WorkflowExecutor();
      const auditSpy = jest.spyOn(executor, 'logStepCompletion');
      
      const run = createMockRun({ steps: [{ id: 'step_1', type: 'extract' }] });
      await executor.execute(run);
      
      expect(auditSpy).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalledWith(run.id, 'step_1', expect.any(Object));
    });
  });
});
```

### 2. LLM Agent Coordination
```typescript
// src/agents/extraction-agent.spec.ts

describe('ExtractionAgent', () => {
  let agent: ExtractionAgent;
  let mockLLMClient: jest.Mocked<LLMClient>;
  
  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    agent = new ExtractionAgent(mockLLMClient);
  });
  
  it('should extract fields from unstructured text', async () => {
    mockLLMClient.call.mockResolvedValue({
      output: {
        claim_id: 'CLM123',
        amount: 1500,
        policy_holder: 'John Doe'
      },
      confidence: 0.95
    });
    
    const result = await agent.extract({
      text: 'Claim for $1500 by John Doe...',
      schema: { claim_id: 'string', amount: 'number', policy_holder: 'string' }
    });
    
    expect(result.claim_id).toBe('CLM123');
    expect(result.confidence).toBeGreaterThan(0.9);
  });
  
  it('should parse confidence and route to approval if low', async () => {
    mockLLMClient.call.mockResolvedValue({
      output: { claim_id: 'CLM123' },
      confidence: 0.4  // low
    });
    
    const result = await agent.extract({ text: 'Ambiguous claim...' });
    
    expect(result.requires_human_review).toBe(true);
    expect(result.confidence).toBe(0.4);
  });
  
  it('should handle LLM timeout gracefully', async () => {
    mockLLMClient.call.mockRejectedValue(new TimeoutError());
    
    const result = await agent.extract({ text: 'Claim...' });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });
  
  it('should deduplicate and validate extracted data', async () => {
    mockLLMClient.call.mockResolvedValue({
      output: {
        claim_id: 'CLM123',
        claim_id_dup: 'CLM123',  // duplicate
        amount: 'invalid'  // invalid format
      }
    });
    
    const result = await agent.extract({ text: 'Claim...' });
    
    expect(result.amount).toBeUndefined();  // invalid, stripped
    expect(Object.keys(result).includes('claim_id_dup')).toBe(false);
  });
});
```

### 3. Google Connectors
```typescript
// src/connectors/gmail.spec.ts

describe('GmailConnector', () => {
  let connector: GmailConnector;
  let mockGoogleClient: jest.Mocked<GoogleClient>;
  
  beforeEach(() => {
    mockGoogleClient = createMockGoogleClient();
    connector = new GmailConnector(mockGoogleClient);
  });
  
  it('should list emails with correct filters', async () => {
    mockGoogleClient.gmail.users.messages.list.mockResolvedValue({
      data: { messages: [{ id: 'msg1', threadId: 't1' }] }
    });
    
    const emails = await connector.listEmails('claims@company.com');
    
    expect(mockGoogleClient.gmail.users.messages.list).toHaveBeenCalledWith({
      userId: 'me',
      q: 'from:claims@company.com'
    });
  });
  
  it('should handle rate limit (429) with backoff', async () => {
    const error = new Error('Rate limit exceeded');
    mockGoogleClient.gmail.users.messages.list
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ data: { messages: [] } });
    
    const emails = await connector.listEmails('claims@company.com');
    
    expect(mockedClient.gmail.users.messages.list).toHaveBeenCalledTimes(2);
  });
  
  it('should encrypt and store credentials safely', async () => {
    const creds = { access_token: 'secret123' };
    await connector.storeCredentials(creds);
    
    const stored = await db.query('SELECT access_token FROM credentials');
    expect(stored.access_token).not.toBe('secret123');  // encrypted
  });
});
```

### 4. Authorization & Access Control
```typescript
// src/middleware/rbac.spec.ts

describe('RBAC Middleware', () => {
  it('should allow operator to view workflows', () => {
    const middleware = rbacMiddleware(['operator']);
    const req = createMockRequest({ user_roles: ['operator'] });
    const res = createMockResponse();
    
    middleware(req, res, jest.fn());
    
    expect(req.user.authorized).toBe(true);
  });
  
  it('should deny operator from approving workflows', () => {
    const middleware = rbacMiddleware(['approver']);
    const req = createMockRequest({ user_roles: ['operator'] });
    const res = createMockResponse();
    
    middleware(req, res, jest.fn());
    
    expect(res.status).toHaveBeenCalledWith(403);
  });
  
  it('should allow admin to do anything', () => {
    const middleware = rbacMiddleware(['operator', 'approver', 'admin']);
    const req = createMockRequest({ user_roles: ['admin'] });
    const res = createMockResponse();
    
    middleware(req, res, jest.fn());
    
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});
```

### 5. Data Validation
```typescript
// src/utils/validators.spec.ts

describe('Validators', () => {
  it('should validate email format', () => {
    expect(validateEmail('user@company.com')).toBe(true);
    expect(validateEmail('invalid-email')).toBe(false);
    expect(validateEmail('user+tag@company.co.uk')).toBe(true);
  });
  
  it('should validate workflow configuration schema', () => {
    const valid = { steps: [{ type: 'extract', output_key: 'fields' }] };
    expect(validateWorkflow(valid)).toHaveProperty('valid', true);
    
    const invalid = { steps: [{ type: 'unknown' }] };
    expect(validateWorkflow(invalid)).toHaveProperty('valid', false);
  });
  
  it('should sanitize user input (prevent XSS)', () => {
    const input = '<script>alert("xss")</script>';
    const sanitized = sanitizeInput(input);
    expect(sanitized).not.toContain('<script>');
  });
});
```

---

## Integration Tests (20% of suite)

**Framework:** Jest + test containers | **Database:** Real PostgreSQL in test container

**Test Areas:**

### 1. Full Workflow Execution
```typescript
// tests/integration/workflow-execution.spec.ts

describe('Full Workflow Execution', () => {
  let db: Database;
  let executor: WorkflowExecutor;
  let llmClient: LLMClient;  // Use real API (with test key + mock responses)
  
  beforeAll(async () => {
    db = await setupTestDatabase();
    executor = new WorkflowExecutor(db, llmClient);
  });
  
  beforeEach(async () => {
    await db.clearTables();
  });
  
  afterAll(async () => {
    await db.cleanup();
  });
  
  it('should execute claims intake workflow end-to-end', async () => {
    // 1. Create workflow
    const workflow = await createTestWorkflow({
      name: 'Claims Intake',
      steps: [
        { id: 'step_1', type: 'extract', input: '{{ email }}' },
        { id: 'step_2', type: 'draft' },
        { id: 'step_3', type: 'approval', approver_role: 'approver' }
      ]
    });
    
    // 2. Create run with test email
    const run = await executor.createRun(workflow.id, {
      email: 'Test email body with claim amount $500...'
    });
    
    // 3. Execute first step (extract)
    await executor.executeStep(run, 'step_1');
    expect(run.context.extracted_fields).toBeDefined();
    expect(run.context.extracted_fields.amount).toBe(500);
    
    // 4. Execute second step (draft) with LLM
    await executor.executeStep(run, 'step_2');
    expect(run.context.draft_output).toBeDefined();
    
    // 5. Verify it's waiting for approval
    expect(run.status).toBe('PENDING_APPROVAL');
    expect(run.pending_approval_step_id).toBe('step_3');
    
    // 6. Simulate approval
    const approval = await executeApproval(run.id, {
      approved: true,
      reviewer_id: approver.id
    });
    
    // 7. Resume execution
    await executor.resumeAfterApproval(run);
    
    // 8. Verify completed
    expect(run.status).toBe('COMPLETED');
    
    // 9. Verify audit trail
    const events = await db.query('SELECT * FROM audit_events WHERE run_id = ?', [run.id]);
    expect(events.length).toBeGreaterThan(3);
  });
  
  it('should handle Google connector failures gracefully', async () => {
    // Mock Gmail API failure
    const gmailConnector = new GmailConnector(mockGoogleClient);
    jest.spyOn(gmailConnector, 'createDraft').mockRejectedValue(
      new Error('Gmail API unavailable')
    );
    
    // Should queue for manual action, not crash
    const result = await executor.executeStep(run, 'create_draft_step');
    expect(result.status).toBe('QUEUED_FOR_MANUAL');
  });
});
```

### 2. API Endpoints
```typescript
// tests/integration/api-endpoints.spec.ts

describe('API Endpoints', () => {
  let app: Express;
  let request: supertest.SuperTest<supertest.Test>;
  let db: Database;
  
  beforeAll(async () => {
    db = await setupTestDatabase();
    app = createApp(db);
    request = supertest(app);
  });
  
  describe('POST /api/workflows', () => {
    it('should create workflow with valid config', async () => {
      const response = await request
        .post('/api/workflows')
        .set('Authorization', `Bearer ${testJWT}`)
        .send({
          name: 'Test Workflow',
          template: 'claims_intake_v1',
          configuration: { ... }
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('created_at');
    });
    
    it('should reject workflow without authorization', async () => {
      const response = await request
        .post('/api/workflows')
        .send({ name: 'Workflow', ... });
      
      expect(response.status).toBe(401);
    });
    
    it('should validate configuration schema', async () => {
      const response = await request
        .post('/api/workflows')
        .set('Authorization', `Bearer ${testJWT}`)
        .send({
          name: 'Test',
          configuration: { invalid: 'config' }
        });
      
      expect(response.status).toBe(400);
      expect(response.body.errors).toBeDefined();
    });
  });
  
  describe('PUT /api/runs/{id}/approve', () => {
    it('should approve pending workflow run', async () => {
      const run = await createTestRun('PENDING_APPROVAL');
      
      const response = await request
        .put(`/api/runs/${run.id}/approve`)
        .set('Authorization', `Bearer ${approverJWT}`)
        .send({ approved: true });
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('COMPLETED');
    });
    
    it('should not allow non-approver to approve', async () => {
      const run = await createTestRun('PENDING_APPROVAL');
      
      const response = await request
        .put(`/api/runs/${run.id}/approve`)
        .set('Authorization', `Bearer ${operatorJWT}`)
        .send({ approved: true });
      
      expect(response.status).toBe(403);
    });
  });
});
```

### 3. Database & Audit Logging
```typescript
// tests/integration/database.spec.ts

describe('Database & Audit Logging', () => {
  it('should create audit entry for every action', async () => {
    const user = await createTestUser();
    
    await approveWorkflow(user.id, workflow.id);
    
    const auditEvents = await db.query(
      'SELECT * FROM audit_events WHERE user_id = ? AND action = ?',
      [user.id, 'approve_workflow']
    );
    
    expect(auditEvents.length).toBe(1);
    expect(auditEvents[0]).toHaveProperty('changes');
    expect(auditEvents[0]).toHaveProperty('ip_address');
  });
  
  it('should never delete audit events (immutable log)', async () => {
    const event = await createTestAuditEvent();
    
    const deleted = await db.query(
      'DELETE FROM audit_events WHERE id = ?',
      [event.id]
    );
    
    expect(deleted).toBe(0);  // Should fail (table constraint)
  });
  
  it('should cascade delete workflow_runs when workflow deleted', async () => {
    const workflow = await createTestWorkflow();
    const run = await createTestRun(workflow.id);
    
    await db.query('DELETE FROM workflows WHERE id = ?', [workflow.id]);
    
    const orphanedRun = await db.query(
      'SELECT * FROM workflow_runs WHERE id = ?',
      [run.id]
    );
    
    expect(orphanedRun.length).toBe(0);  // Cascaded delete
  });
});
```

---

## End-to-End Tests (15-20% of suite)

**Framework:** Cypress | **Browser:** Chromium | **Headless:** Yes (in CI), No (local dev)

**Test Areas:**

### 1. User Authentication & Login Flow
```typescript
// tests/e2e/auth.spec.ts

describe('User Authentication', () => {
  it('should login via Google OAuth', () => {
    cy.visit('/');
    cy.contains('Login with Google').click();
    
    // Google consent screen
    cy.origin('https://accounts.google.com', () => {
      cy.get('[aria-label="Email"]').type(testEmail);
      cy.get('button:contains("Next")').click();
      cy.get('[aria-label="Password"]').type(testPassword);
      cy.get('button:contains("Next")').click();
    });
    
    // Back to app
    cy.url().should('include', '/dashboard');
    cy.contains('Welcome').should('be.visible');
  });
  
  it('should persist JWT token and auto-login on refresh', () => {
    cy.login(testUser);  // custom command
    cy.visit('/dashboard');
    
    cy.reload();  // refresh page
    cy.url().should('include', '/dashboard');  // still logged in
    cy.contains('Welcome').should('be.visible');
  });
  
  it('should logout and clear token', () => {
    cy.login(testUser);
    cy.get('[aria-label="User menu"]').click();
    cy.contains('Logout').click();
    
    cy.url().should('eq', '/');
    cy.window().then(win => {
      expect(win.localStorage.getItem('token')).toBeNull();
    });
  });
});
```

### 2. Workflow Management
```typescript
// tests/e2e/workflows.spec.ts

describe('Workflow Management', () => {
  beforeEach(() => {
    cy.login(testUser);
    cy.visit('/dashboard');
  });
  
  it('should create workflow from template', () => {
    cy.contains('Create Workflow').click();
    cy.contains('Claims Intake').click();
    
    cy.get('input[name="workflow_name"]').type('My Claims Workflow');
    cy.get('input[name="email_trigger"]').type('claims@company.com');
    cy.contains('Create').click();
    
    cy.contains('My Claims Workflow').should('be.visible');
  });
  
  it('should list workflows with correct metadata', () => {
    cy.get('[data-testid="workflow-list"]').within(() => {
      cy.get('[data-testid="workflow-item"]').each($item => {
        cy.wrap($item).should('contain', 'Last run');
        cy.wrap($item).should('contain', 'Runs');
        cy.wrap($item).should('contain', 'Status');
      });
    });
  });
  
  it('should show previous runs in workflow detail', () => {
    cy.contains('My Claims Workflow').click();
    cy.get('[data-testid="run-history"]').within(() => {
      cy.get('[data-testid="run-item"]').should('have.length.at.least', 1);
      cy.get('[data-testid="run-item"]').first().should('contain', 'Completed');
    });
  });
});
```

### 3. Approval Workflow
```typescript
// tests/e2e/approvals.spec.ts

describe('Approval Workflow', () => {
  it('should show pending approval in queue', () => {
    cy.login(approverUser);
    cy.visit('/approvals');
    
    cy.get('[data-testid="approval-queue"]').should('contain', 'Pending Approval');
    cy.get('[data-testid="approval-item"]').first().should('be.visible');
  });
  
  it('should approve workflow with commenting', () => {
    cy.get('[data-testid="approval-item"]').first().click();
    
    cy.get('[data-testid="approval-form"]').within(() => {
      cy.get('textarea').type('Looks good, claim amount verified');
      cy.contains('Approve').click();
    });
    
    cy.contains('Approved').should('be.visible');
    cy.get('[data-testid="approval-queue"]').should('not.contain', this.approval_id);
  });
  
  it('should reject workflow and ask for changes', () => {
    cy.get('[data-testid="approval-item"]').first().click();
    
    cy.contains('Request Changes').click();
    cy.get('textarea').type('Please verify policy number');
    cy.contains('Submit').click();
    
    cy.contains('Awaiting Changes').should('be.visible');
  });
});
```

---

## Performance Testing

**Framework:** k6 (load testing)

```typescript
// tests/performance/load.spec.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,           // 10 virtual users
  duration: '30s',   // 30 second test
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% requests < 500ms
    http_req_failed: ['rate<0.01'],    // error rate < 1%
  }
};

export default () => {
  // Test: Create workflow
  const createRes = http.post(
    'https://staging.app.com/api/workflows',
    JSON.stringify({ name: 'Test Workflow', ... }),
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  
  check(createRes, {
    'create workflow status is 201': (r) => r.status === 201,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
  
  // Test: List workflows
  const listRes = http.get('https://staging.app.com/api/workflows', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  check(listRes, {
    'list workflows status is 200': (r) => r.status === 200,
    'response time < 300ms': (r) => r.timings.duration < 300,
  });
  
  sleep(1);
};
```

---

## CI/CD Integration

**GitHub Actions Workflow:**
```yaml
name: Tests

on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          
  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: password
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run db:migrate
      - run: npm run test:integration
      
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: cypress-io/github-action@v5
        with:
          start: npm run dev
          
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run lint
      - run: npm run type-check
```

---

## Test Coverage Goals

| Area | Target | Rationale |
|------|--------|-----------|
| **Workflow Orchestration** | 90%+ | Critical path; any bug blocks customer |
| **LLM Integration** | 85%+ | Mocked heavily; real API tested in E2E |
| **Google Connectors** | 80%+ | Mocked; real integration tested in E2E |
| **Authorization** | 95%+ | Security-critical; must be thorough |
| **API Endpoints** | 80%+ | Tested via integration tests |
| **Utilities** | 75%+ | Lower priority |
| **Overall** | 80%+ | Code coverage check on CI |

---

## Bug Triage & Severity

| Severity | Definition | Response Time | Example |
|----------|-----------|---|---|
| **P0 Critical** | Workflow broken; data lost | <1 hour pager | Wrong output stored; can't approve |
| **P1 High** | Feature not working; major blocker | <4 hours | Approval button doesn't work |
| **P2 Medium** | Feature partially broken; workaround exists | <24 hours | Slow load time; can refresh |
| **P3 Low** | Minor issue; nice-to-have fix | <1 week | Typo in button label |

---

**Next:** See [DEPLOYMENT.md](./DEPLOYMENT.md) for staging and production rollout.
