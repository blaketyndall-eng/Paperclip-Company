# MVP Implementation Plan - Phase Breakdown

**Duration:** 12 weeks | **Team Size:** 3-4 people | **Go-Live Date:** Post-Week 12 Review

> Implementation note: this document is the target roadmap. For current completion state, see `docs/STATUS.md`.

---

## Phase 1: Foundation & API Core (Weeks 1-4)

### Objectives
- Scaffolding (backend, frontend, infrastructure)
- Authentication (OAuth 2.0 + session management)
- Core workflow orchestration engine
- Database schema with audit logging
- Unit test infrastructure

### Key Deliverables

#### Week 1: Scaffolding & Setup
**Backend:**
- [ ] Project structure (NestJS-style modules, dependency injection)
- [ ] Express server with middleware stack (logging, error handling, auth)
- [ ] PostgreSQL connection with connection pooling
- [ ] Environment variable management (.env, validation)
- [ ] Basic CI/CD pipeline (GitHub Actions)

**Frontend:**
- [ ] Next.js/React project scaffolding
- [ ] Tailwind CSS + design tokens setup
- [ ] TypeScript strict mode enabled
- [ ] Component structure with Storybook (optional but recommended)

**Infrastructure:**
- [ ] GCP project creation
- [ ] Cloud SQL instance (PostgreSQL)
- [ ] Service account for backend
- [ ] GitHub repo with branch protection rules

**Acceptance Criteria:**
- Local dev server runs with `npm run dev`
- Hot reload works for both backend and frontend
- Zero TypeScript errors in both codebases
- GitHub Actions pipeline runs on every PR

---

#### Week 2: Authentication & Authorization
**Backend:**
- [ ] Google OAuth 2.0 integration (login flow)
- [ ] JWT token generation and verification
- [ ] Session management with refresh tokens
- [ ] RBAC middleware (Admin, Approver, Operator, Viewer roles)
- [ ] Audit logging for auth events (login, logout, permission changes)

**Frontend:**
- [ ] Login page component (Google SSO button)
- [ ] Protected route wrapper
- [ ] Context for user state + permissions
- [ ] Token refresh on page load
- [ ] Permission-based UI hiding (hide buttons user can't use)

**Database:**
- [ ] Users table with Google ID, roles, metadata
- [ ] Audit logs table (user_id, action, resource, timestamp, changes)
- [ ] Sessions table (token, expiry, last_activity)
- [ ] Migrations for all tables

**Acceptance Criteria:**
- Login redirects to Google, comes back with JWT
- JWT validates on every API call
- Audit log captures every auth action
- Roles prevent unauthorized API access (403 errors work)
- Refresh token allows session extension without re-login

---

#### Week 3-4: Core Workflow API & LLM Integration
**Backend Workflow Engine:**
- [ ] Workflow model (definition, version, state)
- [ ] Workflow execution engine (step by step)
- [ ] Job queue (Bull/Redis) for async processing
- [ ] LLM integration (Claude drafting agent)
- [ ] Approval workflow orchestration

**API Endpoints (MVP):**
- [ ] POST /workflows — create workflow from template
- [ ] GET /workflows/{id}/runs — list runs of a workflow
- [ ] POST /workflows/{id}/execute — start workflow run
- [ ] PUT /runs/{id}/approve — approve pending action
- [ ] PUT /runs/{id}/reject — reject and get human override option
- [ ] GET /runs/{id}/audit — full audit trail of a run
- [ ] POST /runs/{id}/export — export to Docs/Sheets

**LLM Integration:**
- [ ] Anthropic API client with retry logic
- [ ] Prompt templates for drafting, classification, extraction
- [ ] Confidence scoring + threshold routing
- [ ] Token counting + cost tracking
- [ ] Structured output parsing (JSON, XML)

**Database Schema:**
- [ ] Workflows table (name, type, template, owner, created_at)
- [ ] Workflow_runs table (workflow_id, status, input_data, output_data, created_at, updated_at)
- [ ] Workflow_steps table (run_id, step_index, step_type, status, ai_output, human_decision, timestamp)
- [ ] Audit_events table (all changes above)

**Testing:**
- [ ] Unit tests for workflow orchestration (60%+ coverage)
- [ ] Unit tests for LLM prompting (mock API calls)
- [ ] Integration test: full workflow run from start to approval
- [ ] Error case: LLM failure → queue for retry

**Frontend (Minimal):**
- [ ] Dashboard placeholder (shows authenticated user)
- [ ] API client utility functions
- [ ] Error boundary + toast notifications

**Acceptance Criteria:**
- API endpoints match OpenAPI spec (create /docs/openapi.json)
- Full workflow run completes in <5 seconds (excluding LLM latency)
- LLM output is structured and confidence scored
- All audit events logged to database
- Unit tests run on every commit, PR blocked if coverage drops
- Error handling: LLM timeout, network failure, malformed input all gracefully fail

---

## Phase 2: Google Workspace Integration & Frontend (Weeks 5-8)

### Objectives
- Gmail, Drive, Docs, Sheets connectors working
- Professional UI for workflow management and approvals
- End-to-end workflow from inbox to approved action
- Integration tests for all Google connectors

### Key Deliverables

#### Week 5: Google Workspace Connectors (Phase 1)
**Gmail Integration:**
- [ ] OAuth scopes for Gmail (read_write, modify labels)
- [ ] List emails from specific inbox
- [ ] Label emails (for classification, workflow tagging)
- [ ] Draft email replies (human reviews before send)
- [ ] Send email from workflow (approval permission check)

**Drive Integration:**
- [ ] List files in shared drive or folder
- [ ] Create folder structure for workflow organization
- [ ] Upload files from workflow output
- [ ] Permissions check (shared drive vs. personal)

**Acceptance Criteria:**
- Can read emails from pilot customer's inbox
- Can label emails with workflow status
- Can create folders and upload files
- All Google API calls include retry logic + error handling
- No credentials stored in app; use OAuth refresh tokens only

---

#### Week 6: Google Workspace Connectors (Phase 2)
**Docs Integration:**
- [ ] Create new Docs from template
- [ ] Replace variables in Doc ({{customer_name}}, {{amount}}, etc.)
- [ ] Share Doc with specific roles (viewer, editor, comment-only)
- [ ] Lock Doc for review (prevent editing until approved)

**Sheets Integration:**
- [ ] Append rows to tracking sheet
- [ ] Update statuses in real-time
- [ ] Query historical data (for context in next workflow step)
- [ ] Export workflow summary to Sheet

**Calendar Integration:**
- [ ] Create calendar events for approvals
- [ ] Reminder emails for pending reviews
- [ ] Auto-schedule follow-up calls

**Testing:**
- [ ] Integration tests: full Gmail → Drive → Docs → Sheets flow
- [ ] Test with pilot customer's actual data (staging environment)
- [ ] Error cases: permissions denied, quota exceeded, deleted files

**Acceptance Criteria:**
- Workflow can create, populate, and share a Doc in 3 seconds
- Sheets updates reflect in real-time (sub-500ms)
- Calendar events trigger with correct times and attendees
- All connectors have retry logic (exponential backoff)

---

#### Week 7: Frontend UI (Workflows & Approvals)
**Dashboard Page:**
- [ ] Overview card: total workflows, pending approvals, this week's runs
- [ ] List of active workflows (name, status, last run)
- [ ] Quick stats: time saved estimate, error reduction, completion rate

**Workflow Detail Page:**
- [ ] Workflow configuration (template, inputs, approval steps)
- [ ] Run history (10 most recent, sortable)
- [ ] Each run shows: input data, AI draft output, human decision, audit trail

**Approval Queue Page:**
- [ ] All pending approvals for the user (role-based visibility)
- [ ] For each pending: context (input data), AI-generated draft, comparison to previous runs
- [ ] Approve / Reject buttons; option to edit before approval
- [ ] Auto-refresh (WebSocket or polling every 5 seconds)

**All Pages Must Meet:**
- [ ] Accessible (WCAG 2.1 AA: color contrast, keyboard nav, screen reader support)
- [ ] Mobile-responsive (desktop-first, mobile-secondary)
- [ ] Professional design (no AI-slop templates; consistent spacing, typography)
- [ ] Clear system states (loading, success, error, empty)
- [ ] Performance: <3s page load, <500ms interaction response

**Component Library:**
- [ ] Button (primary, secondary, danger variants)
- [ ] Input (text, email, number, date)
- [ ] Dropdown / Select
- [ ] Table (sortable, pagination)
- [ ] Modal / Sidebar for details
- [ ] Toast notifications
- [ ] Skeleton loaders for async content

**Acceptance Criteria:**
- All UI components use Tailwind tokens (no inline styles)
- Components have TypeScript props fully typed
- Pages render without errors on every viewport size
- First paint <2s on 4G network (Lighthouse audit)
- All interactive elements tested in Cypress

---

#### Week 8: Integration Testing & Bug Fixes
**E2E Tests:**
- [ ] User logs in → sees dashboard
- [ ] User creates workflow from template → workflow appears in list
- [ ] Email arrives in inbox → workflow triggers → draft created
- [ ] User approves draft → action executes → Google Docs created
- [ ] Audit trail shows all steps with timestamps

**Performance Testing:**
- [ ] Workflow execution <5s (excluding LLM latency)
- [ ] Dashboard loads <3s with 50 cached workflows
- [ ] Approval queue updates within 1 second of new approval
- [ ] Concurrent approvals don't conflict (concurrency tests)

**Security Testing:**
- [ ] Cannot access workflows without login
- [ ] Cannot approve workflows I don't have permission to approve
- [ ] Audit trail immutable (no backdated changes)
- [ ] XSS prevention: user input sanitized
- [ ] CSRF tokens on all mutating endpoints

**Acceptance Criteria:**
- All Cypress E2E tests pass (green)
- Performance benchmarks in README
- Security checklist all items verified
- Zero critical bugs; all P1 bugs assigned + fixed
- Code coverage 80%+ on critical paths

---

## Phase 3: Observability, Deployment & Polish (Weeks 9-12)

### Objectives
- Production-ready monitoring and alerting
- Staging and production deployment
- Customer onboarding materials
- Security and compliance review
- Final polish and bug fixes

### Key Deliverables

#### Week 9: Observability & Monitoring

**Logging:**
- [ ] Structured logging (JSON) to Cloud Logging
- [ ] Log levels: DEBUG, INFO, WARN, ERROR
- [ ] Request ID tracing across services
- [ ] PII redaction (no passwords, API keys, customer data in logs)

**Metrics (Prometheus):**
- [ ] Request latency (p50, p95, p99)
- [ ] Error rate and type counts
- [ ] LLM token usage and cost
- [ ] Database query times
- [ ] Job queue depth and processing time
- [ ] Google API call latency and error rates

**Tracing (OpenTelemetry):**
- [ ] Trace full workflow execution
- [ ] Identify bottlenecks (which step takes longest?)
- [ ] Correlate traces with logs via trace ID

**Dashboards (Datadog or Grafana):**
- [ ] System health: uptime, error rate, latency
- [ ] Business metrics: workflows run, approval time, time saved
- [ ] Cost: LLM costs, GCP costs, total spend
- [ ] Customer health: runs per customer, approval queue size

**Alerts:**
- [ ] Error rate > 1% → page on-call
- [ ] Latency p95 > 5s → investigate
- [ ] Job queue depth > 100 → scale workers
- [ ] Database CPU > 80% → alert
- [ ] LLM cost > budget → alert

**Acceptance Criteria:**
- All endpoints emit structured logs
- Dashboard shows real-time metrics
- Alerts trigger correctly (test with synthetic metrics)
- No PII in logs (audit before going live)

---

#### Week 10: Data Export & Compliance

**Data Export Feature:**
- [ ] POST /workflows/{id}/export/all — export all runs to ZIP
- [ ] ZIP contains: workflow definition, all runs (CSV), audit trail (JSON)
- [ ] One-click download in UI (backup + offboarding)
- [ ] Test with realistic data (1000+ workflow runs)

**Compliance Documentation:**
- [ ] Data Processing Agreement (DPA) template
- [ ] Security assessment (checklist completed)
- [ ] Audit trail documentation (what's logged, why, how long?)
- [ ] Backup and disaster recovery plan
- [ ] Incident response procedure

**GDPR/Privacy:**
- [ ] Delete account → cascade delete and purge
- [ ] Data portability endpoint functional
- [ ] Consent tracking (email notifications opt-in)
- [ ] Third-party sub-processor list (Google, Anthropic, etc.)

**Acceptance Criteria:**
- Export works for 1000 runs (< 10 seconds)
- ZIP contains all data in human-readable format
- DPA signed by legal (use template, have backup)
- Incident response playbook tested (fire drill)

---

#### Week 11: Staging & Production Setup

**Staging Environment:**
- [ ] Parity with production (same GCP resources, scaled down)
- [ ] Separate database (no customer data)
- [ ] Test data seeding scripts
- [ ] Automated smoke tests run on deploy
- [ ] Manual testing checklist before prod promotion

**Production Environment:**
- [ ] Cloud SQL with automated backups (daily, 30-day retention)
- [ ] Multi-zone App Engine for auto-scaling
- [ ] CDN for static assets
- [ ] SSL/TLS with auto-renewal
- [ ] Rate limiting (100 req/min per user)
- [ ] DDoS protection

**Deployment Process:**
- [ ] CI/CD: GitHub Actions → build → test → deploy to staging
- [ ] Manual approval for prod (requires 2 reviewers)
- [ ] Blue-green deployment (zero downtime)
- [ ] Rollback procedure (git revert, immediate deploy)
- [ ] Deployment checklist (data migrations, feature flags, monitoring)

**Feature Flags:**
- [ ] New features behind flags (dark launch capability)
- [ ] Gradual rollout (10% users → 50% → 100%)
- [ ] Kill switch for critical bugs

**Acceptance Criteria:**
- Deploy to staging takes <5 minutes
- Deploy to prod takes <10 minutes
- Smoke tests pass before users see deploy
- Zero-downtime deploy (users don't see errors)
- Rollback succeeds in <5 minutes if needed

---

#### Week 12: Polish & Go-Live Readiness

**Final Bug Fixes:**
- [ ] All P1 critical issues fixed
- [ ] All P2 high issues fixed or roadmapped
- [ ] All known regressions resolved
- [ ] Edge cases (low-permission users, large files, etc.) tested

**Customer Readiness:**
- [ ] Onboarding guide (step-by-step, with screenshots)
- [ ] FAQ document
- [ ] Email template for first pilot kickoff
- [ ] Training session outline (30 min walkthrough)
- [ ] Support process and response times documented

**Runbooks:**
- [ ] Operational runbook (how to start server, handle errors, scale)
- [ ] Incident response (what to do if error rate spiked?)
- [ ] Customer communication templates (outage notification, FYI)
- [ ] Post-mortem template (RCA process, how to prevent recurrence)

**Final Sign-Offs:**
- [ ] Product lead: feature-complete, meets spec
- [ ] Engineering lead: code quality, test coverage, documentation
- [ ] DevOps lead: monitoring working, alerts functional
- [ ] Compliance/legal: GDPR/privacy/security checklist passed

**Acceptance Criteria:**
- All sections of go-live checklist signed off
- Pilot customer scheduled and confirmed
- First customer support plan documented
- Team has read and understood runbook

---

## Acceptance Criteria Summary

### Code Quality Gates (All Phases)
- [ ] TypeScript strict mode: zero errors
- [ ] Linter (ESLint) passing: all rules enforced
- [ ] Formatter (Prettier): all files formatted
- [ ] Test coverage: 80%+ on critical paths (business logic)
- [ ] No high/critical security issues (SAST scan)
- [ ] All PRs have at least 1 code review approval

### Performance Targets
- [ ] API response time: p95 < 500ms (excluding LLM)
- [ ] Frontend page load: <3s (Lighthouse audit)
- [ ] Workflow execution: <5s end-to-end (excluding LLM latency)
- [ ] Database queries: p95 < 100ms

### Reliability Targets
- [ ] Staging uptime: 99.5% (calculated weekly)
- [ ] Error rate: <0.1% (over moving 1-week window)
- [ ] Job queue success rate: >99%
- [ ] Zero data loss (backup + restore tested monthly)

### Security Gates (Before Production)
- [ ] All credentials stored in Secret Manager (no .env in repo)
- [ ] OAuth scopes: least privilege (request only what's needed)
- [ ] Audit logging: all actions logged w/ user, timestamp, result
- [ ] SSL/TLS: A+ rating (SSL Labs)
- [ ] Backup tested: data can be restored from backup
- [ ] Incident response drill: team knows what to do

---

## Success Metrics (Post-Launch)

### Business Metrics
- **Time-to-first-value:** Customer completes first workflow run within 30 minutes of kickoff
- **Pilot conversion:** 2 of 3 KPIs (time, error, cycle time) improved by ≥15% by Week 6
- **Expansion rate:** 50%+ of pilots expand to 2nd workflow by Month 3
- **NPS:** > 40 (target 60+ by Month 4)

### Technical Metrics
- **Uptime:** 99.5% (measured monthly)
- **Error rate:** < 0.1% consistent
- **Approval loop time:** Mean 4-6 hours (customers should approve same day)
- **LLM accuracy:** 70%+ of AI drafts accepted without edit (acceptable rework <10%)

### Operational Metrics
- **Support response time:** <4 hours for Severity-2 (pilot phase)
- **Customer onboarding time:** 2-3 hours from kickoff to first live run
- **Bug escape rate:** <1 P1 bug per 1000 deployments

---

## Handoff Criteria (To Growth Phase)

When all of Phase 3 completes successfully:
1. Pilot customer signs contract (even if 30-day free trial)
2. First week of pilot runs smoothly (<99.5% uptime, <0.1% errors)
3. Engineering team can operate system without founder (runbooks clear)
4. Scaling plan documented (Phase 2: visual builder, marketplace, multi-customer clusters)

---

**Next:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for technical design details.
