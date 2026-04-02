# Technical Architecture - MVP

**Version:** 1.0 | **Date:** 2026-04-02 | **Status:** Design Review Ready

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          External Services                          │
├─────────────────────────────────────────────────────────────────────┤
│   Google Workspace APIs          │    LLM (Claude 3.5)    │  Stripe  │
│   (Gmail, Drive, Docs, Sheets)   │    (Anthropic API)     │ (Payment)│
└─────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                      Core Platform Layer                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────┐      ┌──────────────────┐                  │
│  │   REST API          │      │  WebSocket/SSE   │                  │
│  │ (Express.js)        │◄────►│  (Real-time)     │                  │
│  └─────────────────────┘      └──────────────────┘                  │
│          │                             │                             │
│          ▼                             ▼                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │           Application Services Layer                       │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │  • Workflow Orchestration Engine                           │   │
│  │  • LLM Agent Coordinator (drafting, classification)        │   │
│  │  • Approval & Decision Engine                              │   │
│  │  • Google Workspace Connectors (Gmail, Drive, Docs, Etc.)  │   │
│  │  • Auth & Authorization (OAuth, RBAC)                      │   │
│  │  • Audit & Compliance Logger                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│          │                                                           │
│          ▼                                                           │
│  ┌─────────────────────┐       ┌──────────────────┐                │
│  │   Job Queue         │       │  Cache Layer     │                │
│  │  (Bull/Redis)       │       │  (Redis)         │                │
│  └─────────────────────┘       └──────────────────┘                │
│          │                             │                            │
│          └─────────────┬───────────────┘                            │
│                        ▼                                            │
│     ┌─────────────────────────────────────────┐                   │
│     │   Data Persistence Layer                 │                   │
│     ├─────────────────────────────────────────┤                   │
│     │  • PostgreSQL (primary data store)       │                   │
│     │  • Audit Events (immutable log)          │                   │
│     │  • Workflow State & History              │                   │
│     │  • User Sessions & Tokens                │                   │
│     └─────────────────────────────────────────┘                   │
│                        ▲                                            │
└────────────────────────┼────────────────────────────────────────────┘
                         │
         ┌───────────────┼──────────────┐
         ▼               ▼              ▼
    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │Frontend │    │  Ops    │    │Analytics│
    │ (React) │    │Dashboard│    │Pipeline │
    └─────────┘    └─────────┘    └─────────┘
```

---

## Core Layers

### 1. API Gateway & Authentication

**Technology:** Express.js + Passport.js (OAuth 2.0)

**Key Components:**
- OAuth 2.0 login endpoint (redirects to Google, returns JWT)
- JWT verification middleware (on every request)
- Session refresh endpoint (extends token expiry)
- Role-based access control (RBAC) middleware
- Request/response logging and error handling

**Flow:**
```
1. User visits /login → redirects to Google OAuth consent screen
2. User approves → redirect_uri called with auth_code
3. Backend exchanges code for ID token + refresh token
4. Backend creates JWT (signed, 1-hour expiry)
5. Frontend stores JWT in HttpOnly cookie
6. Every API request includes JWT in Authorization header
7. Middleware verifies JWT → extracts user ID and roles
8. Request proceeds with user context attached
```

**Database:**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  roles TEXT[] DEFAULT ARRAY['operator'],  -- operator, approver, admin
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'  -- avatar_url, timezone, preferences
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  refresh_token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action TEXT,  -- 'login', 'create_workflow', 'approve_run', etc.
  resource_type TEXT,  -- 'workflow', 'workflow_run', 'user'
  resource_id UUID,
  changes JSONB,  -- what changed: {before: {...}, after: {...}}
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX (user_id, created_at),
  INDEX (resource_type, resource_id)
);
```

**Error Handling:**
- 401 Unauthorized: JWT expired or invalid → refresh or redirect to login
- 403 Forbidden: User lacks permission → return permission required message
- 400 Bad Request: Invalid input → return field-level error messages
- 500 Server Error: Unhandled exception → log to monitoring, return generic error

---

### 2. Workflow Orchestration Engine

**Core Responsibility:** Execute workflow steps sequentially, handle approvals, manage state transitions.

**Workflow Model:**
```javascript
{
  id: 'workflow_001',
  name: 'Claims Intake',
  version: '1.0',
  owner_id: 'user_123',
  template: 'claims_intake_v1',  // reference to template
  configuration: {
    trigger: 'email_received',
    trigger_config: {
      inbox: 'claims@company.com',
      label_if_matched: 'claims_intake'
    },
    steps: [
      {
        id: 'step_1',
        type: 'extract',  // classify, extract, draft, approve, notify, etc.
        input: '{{ email }}',
        output_key: 'extracted_fields',
        config: { llm_model: 'claude-3.5-sonnet' }
      },
      {
        id: 'step_2',
        type: 'draft',
        input: '{{ extracted_fields }}',
        output_key: 'draft_letter',
        template_id: 'claim_response_template',
        approval_required: true
      },
      {
        id: 'step_3',
        type: 'approval',
        approver_role: 'approver',
        escalation_after: '24h'
      },
      {
        id: 'step_4',
        type: 'action',
        action_type: 'create_doc',
        target: 'docs',
        input: '{{ draft_letter }}',
        output_key: 'doc_url'
      }
    ]
  },
  created_at: '2026-04-02T10:00:00Z',
  updated_at: '2026-04-02T10:00:00Z'
}
```

**Workflow Execution State Machine:**

```
CREATED
  │
  ▼
RUNNING ◄───────┐
  │             │ (retry after error)
  ├─► PENDING_APPROVAL (waiting for human)
  │      │
  │      ├─► APPROVED ─┐
  │      │              │
  │      └─► REJECTED ────▼ ERROR (escalate to support)
  │
  └─► COMPLETED ✓
  
At any point: FAILED or SKIPPED (if conditions not met)
```

**Execution Engine:**
```typescript
class WorkflowExecutor {
  async execute(run: WorkflowRun): Promise<void> {
    const workflow = await this.getWorkflow(run.workflow_id);
    
    for (const step of workflow.configuration.steps) {
      try {
        const result = await this.executeStep(step, run.context);
        
        if (step.type === 'approval') {
          // Wait for human decision
          await this.waitForApproval(run.id, step.id);
          
          if (run.current_request?.status === 'approved') {
            run.context[step.output_key] = run.current_request.decision;
            continue;
          } else {
            throw new HumanRejectionError('Step rejected by human');
          }
        }
        
        run.context[step.output_key] = result;
        await this.logStepCompletion(run.id, step.id, result);
        
      } catch (error) {
        await this.handleStepError(run, step, error);
      }
    }
    
    run.status = 'COMPLETED';
    await this.saveRun(run);
  }
  
  async executeStep(step, context): Promise<any> {
    switch (step.type) {
      case 'extract':
        return await this.extractWithLLM(step, context);
      case 'draft':
        return await this.draftWithLLM(step, context);
      case 'action':
        return await this.executeAction(step, context);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }
}
```

**Database:**
```sql
CREATE TABLE workflows (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES users(id),
  template TEXT,  -- 'claims_intake', 'onboarding', etc.
  version TEXT,
  configuration JSONB NOT NULL,  -- full workflow definition
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  status TEXT,  -- CREATED, RUNNING, PENDING_APPROVAL, COMPLETED, FAILED
  trigger_data JSONB,  -- email or form data that triggered this
  context JSONB,  -- accumulated data through steps (extracted_fields, draft, etc.)
  pending_approval_step_id TEXT,  -- which step is waiting for approval?
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX (workflow_id, created_at),
  INDEX (status)
);

CREATE TABLE workflow_steps (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES workflow_runs(id),
  step_id TEXT,  -- 'step_1', 'step_2'
  step_type TEXT,  -- 'extract', 'draft', 'approval', etc.
  input JSONB,  -- what was passed to this step
  output JSONB,  -- what this step produced
  ai_output JSONB,  -- if LLM-generated, the full output including confidence
  status TEXT,  -- PENDING, IN_PROGRESS, COMPLETED, ERROR, SKIPPED
  error_message TEXT,
  human_decision JSONB,  -- if approval step: {approved: true, reviewer_id: ..., reviewed_at: ...}
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INT,
  INDEX (run_id, step_id)
);
```

---

### 3. LLM Agent Coordinator

**Agents Used:**

1. **Classification Agent:** Triage incoming requests (priority, category)
2. **Extraction Agent:** Pull structured fields from unstructured data
3. **Drafting Agent:** Generate response documents, emails, decisions
4. **Validation Agent:** Check output quality and policy compliance

**API Usage Pattern:**
```typescript
interface LLMRequest {
  agent_type: 'classify' | 'extract' | 'draft' | 'validate';
  prompt_template: string;  // e.g., 'classify_claims'
  input_data: Record<string, any>;
  model: 'claude-3.5-sonnet';
  temperature: 0.3;  // lower = deterministic, higher = creative
  max_tokens: 1000;
  timeout_ms: 30000;
}

async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const prompt = renderTemplate(request.prompt_template, request.input_data);
  
  try {
    const response = await anthropic.messages.create({
      model: request.model,
      max_tokens: request.max_tokens,
      messages: [{ role: 'user', content: prompt }]
    });
    
    return {
      success: true,
      output: parseOutput(response.content[0].text),
      confidence: calculateConfidence(response),
      tokens_used: response.usage.output_tokens,
      cost: calculateCost(response.usage)
    };
  } catch (error) {
    // Retry logic
    if (isRetryable(error)) {
      return retry(request, attempt + 1);
    }
    throw error;
  }
}
```

**Prompt Templates (examples):**

*Extract Agent:*
```
Given the following email, extract the following fields: {fields}
Return as JSON.

Email:
{email_body}

JSON:
```

*Draft Agent:*
```
Based on this claim information: {claim_fields}
Look at this similar previous response for style: {example_response}
Draft a professional response letter.
Keep tone: professional, empathetic, clear.

Output as clean text (not markdown).
```

*Validation Agent:*
```
Validate this draft response for:
1. Completeness (all required fields addressed)
2. Policy compliance (professional tone, no promises we can't keep)
3. Clarity (understandable to customer)

Return JSON: {is_valid: bool, issues: [...], confidence: 0-1}
```

**Cost Tracking:**
```sql
CREATE TABLE llm_usage (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES workflow_runs(id),
  agent_type TEXT,
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  cost_usd DECIMAL(10, 4),
  response_time_ms INT,
  success BOOLEAN,
  created_at TIMESTAMP
);

-- Daily summary
SELECT 
  DATE(created_at) as date,
  agent_type,
  COUNT(*) as calls,
  SUM(cost_usd) as total_cost
FROM llm_usage
GROUP BY DATE(created_at), agent_type;
```

---

### 4. Google Workspace Connectors

**Gmail Connector:**
```typescript
class GmailConnector {
  async listEmails(inbox: string, filter?: string) {
    // Query Gmail API with filter
    // Return: [{ id, subject, from, to, body, attachments, labels }]
  }
  
  async labelEmail(messageId: string, label: string) {
    // Add label to message (workflow tracking)
  }
  
  async createDraft(to: string, subject: string, body: string) {
    // Create draft reply (human reviews before send)
  }
  
  async sendEmail(messageId: string, body: string) {
    // Send reply to message
  }
}
```

**Drive Connector:**
```typescript
class DriveConnector {
  async createFolder(name: string, parent_id?: string) {
    // Create new folder; return folder ID
  }
  
  async uploadFile(name: string, mime_type: string, content: Buffer) {
    // Upload file to Drive; return file ID
  }
  
  async shareFolder(folder_id: string, email: string, role: 'viewer' | 'editor') {
    // Grant access to folder
  }
}
```

**Docs Connector:**
```typescript
class DocsConnector {
  async createDocFromTemplate(template_content: string, variables: Record<string, string>) {
    // Create new Doc, substitute variables
    // return { doc_id, doc_url }
  }
  
  async shareDoc(doc_id: string, email: string, role: 'viewer' | 'editor' | 'commenter') {
    // Grant access to doc
  }
}
```

**Sheets Connector:**
```typescript
class SheetsConnector {
  async appendRow(sheet_id: string, values: any[]) {
    // Append row to tracking sheet
  }
  
  async updateCell(sheet_id: string, range: string, value: any) {
    // Update specific cell (e.g., status column)
  }
}
```

**Connector Error Handling:**
```typescript
// Retry with exponential backoff
// Fallback to manual update (queue email to human)
// Log all failures for root cause analysis
```

**Database:**
```sql
CREATE TABLE google_credentials (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  resource_type TEXT,  -- 'gmail', 'drive', 'docs', 'sheets'
  access_token TEXT ENCRYPTED,
  refresh_token TEXT ENCRYPTED,
  expires_at TIMESTAMP,
  scopes TEXT[] NOT NULL,  -- ['gmail.modify', 'drive.file', ...]
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(user_id, resource_type)
);

CREATE TABLE connector_operations (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES workflow_runs(id),
  connector_type TEXT,  -- 'gmail', 'drive', 'docs', 'sheets'
  operation TEXT,  -- 'list', 'create', 'update', 'share'
  input JSONB,
  output JSONB,
  status TEXT,  -- 'success', 'retry', 'failed'
  error_message TEXT,
  duration_ms INT,
  created_at TIMESTAMP
);
```

---

### 5. Data Models & Schema

**Core Tables:**
```sql
-- Users (from Auth layer)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  google_id TEXT UNIQUE,
  email TEXT UNIQUE,
  display_name TEXT,
  roles TEXT[] DEFAULT ARRAY['operator'],
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Workflows (template definitions)
CREATE TABLE workflows (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID REFERENCES users(id),
  template TEXT,  -- 'claims_intake_v1'
  version TEXT,
  configuration JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Workflow Runs (executions)
CREATE TABLE workflow_runs (
  id UUID PRIMARY KEY,
  workflow_id UUID REFERENCES workflows(id),
  status TEXT,  -- execution state
  trigger_data JSONB,
  context JSONB,  -- accumulated data
  pending_approval_step_id TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Workflow Steps (individual steps)
CREATE TABLE workflow_steps (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES workflow_runs(id),
  step_id TEXT,
  step_type TEXT,
  input JSONB,
  output JSONB,
  ai_output JSONB,
  status TEXT,
  human_decision JSONB,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INT
);

-- Audit Events (immutable log)
CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action TEXT,
  resource_type TEXT,
  resource_id UUID,
  changes JSONB,
  ip_address TEXT,
  created_at TIMESTAMP
);

-- LLM Usage (cost tracking)
CREATE TABLE llm_usage (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES workflow_runs(id),
  agent_type TEXT,
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  cost_usd DECIMAL(10, 4),
  response_time_ms INT,
  success BOOLEAN,
  created_at TIMESTAMP
);
```

---

### 6. Frontend Architecture (React + TypeScript)

**Directory Structure:**
```
frontend/
├── src/
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── WorkflowPage.tsx          # Workflow details & history
│   │   ├── ApprovalQueuePage.tsx    # All pending approvals
│   │   └── SettingsPage.tsx
│   │
│   ├── components/
│   │   ├── WorkflowCard.tsx
│   │   ├── ApprovalForm.tsx
│   │   ├── AuditTrail.tsx
│   │   ├── DashboardMetrics.tsx
│   │   └── [other UI components]
│   │
│   ├── hooks/
│   │   ├── useAuth.ts               # Auth context + login/logout
│   │   ├── useWorkflows.ts          # Workflow API calls
│   │   ├── useApprovals.ts          # Fetch pending approvals
│   │   └── useWebSocket.ts          # Real-time updates
│   │
│   ├── context/
│   │   ├── AuthContext.tsx
│   │   └── WorkflowContext.tsx
│   │
│   ├── utils/
│   │   ├── api.ts                   # Axios instance + base URL
│   │   ├── formatters.ts            # Time, dates, numbers
│   │   └── validators.ts            # Input validation
│   │
│   └── App.tsx                      # Root component
```

**State Management:**
```typescript
// useAuth: manage login state and JWT
const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Check if JWT exists in cookie
    // Verify JWT with backend
    // Set user state
  }, []);
  
  const login = () => {
    window.location.href = '/api/auth/google';
  };
  
  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  };
  
  return { user, isLoading, login, logout };
};

// useWorkflows: fetch and cache workflows
const useWorkflows = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    setIsLoading(true);
    api.get('/api/workflows').then(data => {
      setWorkflows(data);
      setIsLoading(false);
    });
  }, []);
  
  return { workflows, isLoading };
};

// useApprovals: real-time approval queue
const useApprovals = () => {
  const [approvals, setApprovals] = useState<WorkflowRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    // Subscribe to WebSocket for real-time updates
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setApprovals(prev => [...prev, data]);  // new approval arrived
    };
    return () => ws.close();
  }, []);
  
  return { approvals, isLoading };
};
```

**Key Pages:**

*DashboardPage:*
```typescript
export function DashboardPage() {
  const { workflows } = useWorkflows();
  const { approvals } = useApprovals();
  
  return (
    <div className="p-6">
      <h1>Dashboard</h1>
      
      <DashboardMetrics
        total_runs={workflows.reduce((sum, w) => sum + w.run_count, 0)}
        pending_approvals={approvals.length}
        time_saved_hours={calculateTimeSaved(workflows)}
      />
      
      <section className="mt-8">
        <h2>Pending Approvals ({approvals.length})</h2>
        <ApprovalQueue approvals={approvals} />
      </section>
      
      <section className="mt-8">
        <h2>Workflows</h2>
        <WorkflowList workflows={workflows} />
      </section>
    </div>
  );
}
```

*ApprovalQueuePage:*
```typescript
export function ApprovalQueuePage() {
  const { approvals, isLoading } = useApprovals();
  const [selectedApproval, setSelectedApproval] = useState<WorkflowRun | null>(null);
  
  return (
    <div className="flex gap-6 p-6">
      {/* Left: List of approvals */}
      <div className="flex-1">
        {isLoading ? <Skeleton /> : (
          <ul className="space-y-2">
            {approvals.map(approval => (
              <li
                key={approval.id}
                className="p-4 border rounded cursor-pointer hover:bg-gray-50"
                onClick={() => setSelectedApproval(approval)}
              >
                <div className="font-semibold">{approval.workflow_name}</div>
                <div className="text-sm text-gray-600">{approval.content_preview}</div>
                <div className="text-xs text-gray-500">{timeAgo(approval.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {/* Right: Detail + approval form */}
      {selectedApproval && (
        <div className="flex-1">
          <ApprovalDetail
            approval={selectedApproval}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </div>
      )}
    </div>
  );
}
```

---

### 7. Operation & Deployment

**Staging Environment:**
- Identical infra to prod (but scaled down)
- Separate database with seeded test data
- All services deployed to staging first
- Smoke tests run automatically after each deploy

**Production Environment:**
- Multi-zone App Engine (auto-scaling)
- Cloud SQL with backups
- CDN for static assets
- Rate limiting + DDoS protection

**Monitoring & Alerting:**
```
Key Metrics:
- API response time (p50, p95, p99)
- Error rate (count + type)
- Job queue depth
- Database CPU/connections
- LLM cost per day
- Workflow execution time by type

Alerts (page on-call):
- Error rate > 1% for 5 min
- API latency p95 > 5s for 10 min
- Database CPU > 80% for 10 min
- Job queue stuck (depth > 100 for 30 min)
```

**Deployment Process:**
1. Push to branch → GitHub Actions runs tests
2. Tests pass → build Docker image
3. Deploy to staging
4. Smoke tests pass → ready for prod
5. Manual approval on PR
6. Deploy to prod (blue-green)
7. Monitor for errors → rollback if needed

---

## Key Design Decisions & Rationale

| Decision | Rationale | Alternative |
|----------|-----------|------------|
| **Express.js** | Lightweight, modular, fast to iterate. Familiar to most JS teams. | FastAPI (Python) — good but less mature async in JS ecosystem |
| **PostgreSQL** | ACID guarantees, audit trail support, geo-replication. Proven at scale. | MongoDB — eventual consistency, not ideal for financial workflows |
| **Bull for job queue** | Redis-backed, reliable retries, good for Vercel/GCP. | AWS SQS — vendor lock-in |
| **Claude 3.5 Sonnet** | Best-in-class reasoning, vision support. Cost-effective ($3/$15 per M tokens). | GPT-4 — more expensive, overkill for most workflows |
| **React frontend** | Component-driven, fast dev, good for solo founder. | Vue — equally good, pick React for broader hiring pool |
| **GCP (App Engine)** | Native Google Workspace integration, auto-scaling, KMS. | AWS — more complex; Vercel — limitations on long-running jobs |
| **No visual builder MVP** | Reduce scope to 12 weeks. Template-based is faster to build. | Include builder — extends timeline to 20 weeks |
| **Audit-first** | Required for compliance, builds trust. Easy to add later if missing. | Audit-later — adds debt, hard to retrofit |

---

## Security Considerations

**Data in Transit:**
- TLS 1.3 for all endpoints
- Refresh tokens in HttpOnly cookies (not localStorage)
- CORS restricted to domains

**Data at Rest:**
- PostgreSQL encryption at capacity level
- Sensitive fields (API keys, credentials) encrypted with Google KMS
- No customer PII in application logs

**Access Control:**
- OAuth 2.0 (no passwords)
- Scope limitation (only request needed Google scopes)
- Role-based (Admin, Approver, Operator, Viewer)
- Audit trail for every action

**Secrets Management:**
- No secrets in code or .env (use Google Secret Manager)
- Automatic secret rotation
- Least privilege service account permissions

---

## Scalability Considerations

**Horizontal Scaling:**
- Stateless API servers (scale with load balancer)
- Redis cache for session data (shared across servers)
- PostgreSQL as single source of truth

**Vertical Scaling Path:**
- App Engine auto-scaling handles burst
- Cloud SQL read replicas for read-heavy queries
- Redis for caching frequently-accessed data

**Cost Optimization:**
- LLM caching (if same prompt input, reuse output)
- Batch API calls (group multiple jobs per request)
- Archive old workflow runs to cold storage (after 90 days)

---

**Next:** See [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) for test approach.
