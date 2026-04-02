# Lightweight AI Workflow Platform - MVP Implementation Plan

**Status:** Production Planning | **Phase:** Architecture & Scaffolding | **Timeline:** 12 weeks to pilot-ready

This is a comprehensive implementation plan for building a production-grade MVP of a Google Workspace-first AI workflow automation platform targeted at small operations teams (10-100 people).

## Quick Links

- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** — Phase-by-phase roadmap with milestones and acceptance criteria
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Technical design, stack decisions, and system diagrams
- **[TESTING_STRATEGY.md](./TESTING_STRATEGY.md)** — Unit, integration, E2E test approach and metrics
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Staging, rollout, monitoring, and incident response
- **[RUNBOOK.md](./RUNBOOK.md)** — Operational procedures, troubleshooting, and maintenance

## Overview

### MVP Scope

**In Scope:**
- One end-to-end workflow automation (claims intake example)
- Gmail, Drive, Docs, Sheets, Calendar integrations
- Human-in-the-loop approval workflow
- Basic analytics dashboard with KPI tracking
- Professional UI with anti-AI-slop standards
- OAuth 2.0 + RBAC access control
- Audit logging for compliance

**Out of Scope (Phase 2+):**
- Visual workflow builder (initially: template-based)
- Workflow marketplace
- Custom integrations beyond Google Workspace
- Advanced analytics/benchmarking
- Mobile app (web-first, mobile-responsive)

### Success Criteria

#### Pilot Readiness (12 weeks)
- Zero critical bugs in core workflow loop
- 20%+ time reduction measurable in pilot
- <30 min time-to-first-value for trained users
- 85%+ task completion rate on primary workflow
- 99.5% uptime in staging
- SOC 2 Type I readiness documentation
- Full audit trail of all actions
- Clean data export path without lock-in

#### Go-Live Requirements
- All critical issues resolved
- Pilot customer onboarding complete
- Customer success playbook tested
- Monitoring alerts configured
- On-call runbook completed
- Legal/compliance reviewed

## Tech Stack (Recommendations)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Backend** | Node.js + TypeScript | Fast iteration, strong types, AI agent libraries |
| **Framework** | Express.js + NestJS-like structure | Lightweight, modular, testable |
| **Database** | PostgreSQL | ACID compliance, audit trail support, geo-replication |
| **Queueing** | Bull (Redis-backed) | Job retries, workflow orchestration |
| **LLM** | Claude 3.5 Sonnet (Anthropic API) | Best-in-class reasoning, cost-effective, vision support |
| **Frontend** | React + TypeScript + Tailwind | Fast, component-driven, design system ready |
| **Auth** | OAuth 2.0 (Google) + custom sessions | Zero passwords, audit trail per user |
| **Monitoring** | Datadog (or open-source: Prometheus + Grafana) | Structured logs, APM, alerting |
| **Infrastructure** | GCP (App Engine, Cloud Tasks, Cloud SQL) | Google Workspace integration, auto-scaling, compliance |
| **Testing** | Jest + Playwright + Cypress | Unit, integration, E2E coverage |
| **CI/CD** | GitHub Actions | Free, integrated, fast feedback |
| **Secrets** | Google Secret Manager | Native to GCP, audit logging |

## Deliverables

### By Week 4 (MVP Core)
- [ ] Backend API scaffolding (auth, routing, middleware)
- [ ] PostgreSQL schema with audit logging
- [ ] Google OAuth integration
- [ ] One workflow (claims intake) API endpoints
- [ ] LLM integration for draft generation
- [ ] Unit test suite (70%+ coverage)

### By Week 8 (UI + Integration)
- [ ] React frontend with professional UI
- [ ] Gmail, Drive, Docs, Sheets connectors
- [ ] Human approval workflow UI
- [ ] KPI dashboard
- [ ] Integration tests (80%+ coverage)
- [ ] Clear error handling and recovery

### By Week 12 (Polish + Deployment)
- [ ] End-to-end tests passing
- [ ] Observability configured (logging, metrics, traces)
- [ ] Staging environment working
- [ ] Customer onboarding materials
- [ ] Security audit and fixes
- [ ] Runbooks and playbooks complete

## Key Design Decisions

### 1. Human-in-the-Loop Architecture
Every high-risk action requires human approval:
- AI generates draft → human reviews → human approves → action executes
- Full audit trail of who changed what and why
- Confidence thresholds route low-confidence outputs to review queue

### 2. Google Workspace as Default UI
Users never leave Gmail/Drive/Docs/Sheets:
- Triggers: email, Drive file upload, form submission
- Actions: create docs, update sheets, send draft emails, schedule reminders
- Result: no new tool to learn, faster adoption

### 3. Template-Based MVP (No Visual Builder Yet)
Phase 1: Configure workflows via JSON/YAML templates
Phase 2: Add visual drag-and-drop builder
Benefit: 4-week build vs. 12 weeks for builder

### 4. Event-Driven, Audit-First Design
Every workflow step generates an event:
- Structured logging to PostgreSQL
- Queryable audit trail for compliance
- Foundation for Intelligence Web (Phase 2)

### 5. Pragmatic Error Recovery
- Failed steps don't cascade (queue for manual retry)
- Connector unavailable? Offer manual fallback
- AI misbehavior? Human can override and rerun
- Full export path if customer wants to leave

---

## Stakeholder Responsibilities

| Role | Responsibilities | Success Criteria |
|------|---|---|
| **Founder/Product** | Define first workflow, customer feedback, GTM validation | Pilot customer happy, willing to expand |
| **Backend Engineer** | API, auth, Google integrations, job queue | All endpoints tested, zero auth bypasses, <2s latency |
| **Frontend Engineer** | UI/UX, dashboard, forms, compliance with design system | <30 min time-to-first-value, 85% task completion |
| **DevOps Engineer** | Infrastructure, monitoring, staging/prod parity | 99.5% uptime, sub-30s deploys, alerts working |
| **QA / Test Automation** | Test strategy, automation, edge cases, compliance checks | 80%+ test coverage, all critical paths tested, zero regressions |

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Google Workspace API changes | Low | Medium | Pin API versions, test quarterly |
| LLM output unreliability | Medium | High | Always require human approval, measure acceptance rate |
| Data export on day 1 | Low | High | Build offboarding sprint at Week 10 |
| Security audit failure | Low | High | Engage security consultant at Week 6, fix by Week 10 |
| Customer churn post-pilot | Medium | Medium | Implement success playbook + weekly check-ins |

---

## Getting Started

### Prerequisites
- Google Cloud Project with OAuth configured
- Anthropic API key (Claude 3.5 Sonnet)
- PostgreSQL database
- Node.js 20+
- Familiarity with TypeScript, React, PostgreSQL

### Local Development
```bash
git clone <repo>
cd mvp
npm install

# Set environment variables
cp .env.example .env
# Fill in GOOGLE_CLIENT_ID, ANTHROPIC_API_KEY, DATABASE_URL

# Run migrations
npm run db:migrate

# Start dev server
npm run dev

# Run tests
npm run test
```

### Folders Structure
```
.
├── backend/
│   ├── src/
│   │   ├── api/          # HTTP routes and middleware
│   │   ├── services/     # Business logic (workflows, Google connectors)
│   │   ├── models/       # Data models, schema
│   │   ├── agents/       # LLM agents (drafting, triage, validation)
│   │   ├── jobs/         # Background job handlers
│   │   ├── middleware/   # Auth, errors, logging
│   │   └── utils/        # Helpers (Google client, LLM, audit)
│   ├── tests/            # Unit and integration tests
│   ├── migrations/       # Database migrations
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/        # Route pages (dashboard, workflows, approvals)
│   │   ├── components/   # Reusable UI components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── context/      # Global state (auth, workflows)
│   │   ├── styles/       # Tailwind + design tokens
│   │   └── utils/        # API helpers, formatters
│   ├── tests/            # Component and E2E tests
│   └── package.json
├── infra/
│   ├── gcp/              # Terraform for GCP resources
│   ├── docker/           # Docker configs for local dev
│   └── monitoring/       # Datadog dashboards, alerts
├── docs/
│   ├── API.md            # OpenAPI spec
│   ├── SCHEMA.md         # Database schema
│   └── WORKFLOW_EXAMPLES.md
├── IMPLEMENTATION_PLAN.md
├── ARCHITECTURE.md
├── TESTING_STRATEGY.md
├── DEPLOYMENT.md
└── RUNBOOK.md
```

---

## Next Steps

1. **Week 1:** Review ARCHITECTURE.md, set up GCP project, create GitHub repo
2. **Week 2:** Scaffold backend + frontend, implement OAuth, first integration test
3. **Week 3-4:** Build core workflow API, LLM integration, unit tests
4. **Week 5-8:** Frontend, Google Workspace connectors, integration tests
5. **Week 9-12:** Polish, observability, deployment, customer readiness

---

**Questions?** See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for detailed phase breakdown or [ARCHITECTURE.md](./ARCHITECTURE.md) for technical design.

