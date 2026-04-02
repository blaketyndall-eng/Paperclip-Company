# GitHub Repository Initialization Guide

**This guide sets up the repository structure for MVP implementation.**

---

## Quick Start

### 1. Create GitHub Repository

```bash
# Create repo on GitHub
# https://github.com/new
# Name: lightweight-ai-mvp
# Description: Lightweight AI workflow automation platform for small ops teams
# Visibility: Private
# Initialize with README: No

# Clone and initialize
git clone git@github.com:company/lightweight-ai-mvp.git
cd lightweight-ai-mvp
```

### 2. Set Up Branch Protection

```bash
# Configure GitHub branch protection (via Settings > Branches > main)

# - Require pull request reviews (minimum 2)
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Dismiss stale pull request approvals
- Require code owners review
```

### 3. Folder Structure

Copy this structure into your repo:

```
lightweight-ai-mvp/
├── README.md                          # Overview (this file)
├── IMPLEMENTATION_PLAN.md             # 12-week roadmap
├── ARCHITECTURE.md                    # Technical design
├── TESTING_STRATEGY.md                # Test approach
├── DEPLOYMENT.md                      # Release process
├── RUNBOOK.md                         # Operational procedures
├── .gitignore                         # Files to exclude from git
├── package.json                       # Root package for tools
│
├── backend/
│   ├── src/
│   │   ├── api/                      # REST endpoints
│   │   ├── services/                 # Business logic
│   │   ├── models/                   # Data models
│   │   ├── agents/                   # LLM agents
│   │   ├── jobs/                     # Background jobs
│   │   ├── middleware/               # Auth, errors, logging
│   │   └── utils/                    # Helpers
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   ├── migrations/                   # Database migrations (Flyway or Knex)
│   ├── Dockerfile
│   ├── docker-compose.yml            # Local dev environment
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── public/                       # Static assets
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── styles/
│   │   ├── utils/
│   │   └── App.tsx
│   ├── tests/
│   │   ├── unit/
│   │   └── e2e/
│   ├── package.json
│   └── tsconfig.json
│
├── infra/
│   ├── gcp/
│   │   ├── main.tf                   # Terraform: App Engine, Cloud SQL, etc.
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── docker/
│   │   ├── Dockerfile.backend
│   │   └── Dockerfile.frontend
│   └── monitoring/
│       ├── dashboards.json           # Grafana dashboards
│       └── alerts.json               # Alert rules
│
├── docs/
│   ├── API.md                         # OpenAPI spec
│   ├── SCHEMA.md                      # Database schema
│   └── WORKFLOW_EXAMPLES.md           # Example workflows
│
└── .github/
    └── workflows/
        └── ci-cd.yml                  # GitHub Actions pipelines
```

### 4. Root .gitignore

```
# Node
node_modules/
npm-debug.log*
yarn-debug.log*
.npm/
.pnpm-lock.yaml

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Build
dist/
build/
*.tsbuildinfo

# Testing
coverage/
.nyc_output/

# Logs
logs/
*.log

# Secrets (double-check before committing)
secrets/
*.pem
*.key
```

### 5. Root package.json (Tools & Scripts)

```json
{
  "name": "lightweight-ai-mvp",
  "version": "0.1.0",
  "private": true,
  "description": "Lightweight AI workflow automation platform",
  "scripts": {
    "dev": "concurrently npm:dev:backend npm:dev:frontend",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",
    "build": "npm run build:backend && npm run build:frontend",
    "build:backend": "cd backend && npm run build",
    "build:frontend": "cd frontend && npm run build",
    "test": "npm run test:backend && npm run test:frontend",
    "test:backend": "cd backend && npm run test",
    "test:frontend": "cd frontend && npm run test",
    "test:e2e": "cd frontend && npm run test:e2e",
    "lint": "npm run lint:backend && npm run lint:frontend",
    "lint:backend": "cd backend && npm run lint",
    "lint:frontend": "cd frontend && npm run lint",
    "fmt": "npm run fmt:backend && npm run fmt:frontend",
    "fmt:backend": "cd backend && npm run fmt",
    "fmt:frontend": "cd frontend && npm run fmt"
  },
  "dependencies": {
    "concurrently": "^8.0.0"
  }
}
```

### 6. Backend package.json (Starter)

```json
{
  "name": "@company/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "lint": "eslint src/**/*.ts",
    "fmt": "prettier --write src/**/*.ts",
    "db:migrate": "flyway migrate",
    "db:create": "flyway baseline"
  },
  "dependencies": {
    "express": "^4.18.2",
    "dotenv": "^16.0.3",
    "pg": "^8.9.0",
    "redis": "^4.6.5",
    "bull": "^4.11.0",
    "passport": "^0.6.0",
    "jsonwebtoken": "^9.0.0",
    "@anthropic-ai/sdk": "^0.4.0",
    "googleapis": "^118.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^18.0.0",
    "@types/express": "^4.17.0",
    "tsx": "^3.12.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^5.0.0",
    "prettier": "^3.0.0"
  }
}
```

### 7. Frontend package.json (Starter)

```json
{
  "name": "@company/frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:e2e": "cypress run",
    "test:e2e:open": "cypress open",
    "lint": "eslint src/**/*.ts src/**/*.tsx",
    "fmt": "prettier --write src/**/*.{ts,tsx}"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.14.0",
    "zustand": "^4.3.0",
    "axios": "^1.4.0",
    "tailwindcss": "^3.3.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.4.0",
    "vitest": "^0.34.0",
    "@testing-library/react": "^14.0.0",
    "cypress": "^13.0.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^5.0.0",
    "prettier": "^3.0.0"
  }
}
```

### 8. GitHub Actions Workflow (.github/workflows/ci-cd.yml)

```yaml
name: CI/CD

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main, staging]

env:
  GCP_PROJECT: ${{ secrets.GCP_PROJECT }}
  GCP_REGION: us-central1

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: password
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm run build
      - uses: actions/upload-artifact@v3
        with:
          name: build
          path: dist/

  deploy-staging:
    if: github.ref == 'refs/heads/staging'
    needs: [lint, test, build]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - uses: google-github-actions/setup-gcloud@v1
      - run: gcloud app deploy --service=staging

  deploy-prod:
    if: github.ref == 'refs/heads/main'
    needs: [lint, test, build]
    environment: production
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
      - uses: google-github-actions/setup-gcloud@v1
      - run: gcloud app deploy --service=prod --no-promote
```

---

## Getting Started (Day 1)

### Step 1: Team Kickoff (30 min)
```bash
# Review this implementation plan with team
# Share: IMPLEMENTATION_PLAN.md, ARCHITECTURE.md
# Assign: Roles (see IMPLEMENTATION_PLAN.md)
```

### Step 2: Set Up Local Dev (1-2 hours)
```bash
# Clone repo
git clone git@github.com:company/lightweight-ai-mvp.git
cd lightweight-ai-mvp

# Install dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Set up .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Start dev servers
npm run dev
# Frontend: http://localhost:3000
# Backend: http://localhost:3001
```

### Step 3: Create GCP Project (1-2 hours)
```bash
# Via Google Cloud Console
gcloud projects create lightweight-ai-mvp --name="Lightweight AI MVP"

# Enable APIs
gcloud services enable appengine.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable storage-api.googleapis.com
gcloud services enable cloudkms.googleapis.com

# Create Cloud SQL instance
gcloud sql instances create prod \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

# Create database
gcloud sql databases create app --instance=prod

# Create service account
gcloud iam service-accounts create app \
  --display-name="App Service Account"
```

### Step 4: Configure Secrets (1 hour)
```bash
# Store sensitive values in Google Secret Manager
gcloud secrets create DATABASE_URL \
  --replication-policy="automatic" \
  --data-file=- <<< "postgresql://user:pass@cloud-sql:5432/app"

gcloud secrets create ANTHROPIC_API_KEY \
  --replication-policy="automatic"

gcloud secrets create GOOGLE_CLIENT_ID \
  --replication-policy="automatic"

gcloud secrets create GOOGLE_CLIENT_SECRET \
  --replication-policy="automatic"

# Grant app service account access
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member=serviceAccount:app@project.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

### Step 5: First Deployment to Staging (2-3 hours)
```bash
# Deploy backend to staging
cd backend
npm run build
gcloud app deploy --service=staging

# Deploy frontend to staging
cd ../frontend
npm run build
gcloud app deploy --service=staging-frontend

# Verify
curl https://staging.app.com/health
```

---

## Milestones & Sign-Offs

### Week 1: Foundation Ready
- [ ] GitHub repo set up with branch protection
- [ ] All team members have access
- [ ] GCP project created and configured
- [ ] Local dev environment works for all
- [ ] First build passes linter
- [ ] **Sign-off:** Engineering lead

### Week 4: Core API Done
- [ ] All backend endpoints built
- [ ] OAuth working
- [ ] Database schema created
- [ ] Unit tests passing (60%+ coverage)
- [ ] **Sign-off:** Backend engineer + product

### Week 8: MVP Feature Complete
- [ ] Frontend UI complete
- [ ] All Google integrations working
- [ ] Integration tests passing
- [ ] Staging deployment working
- [ ] **Sign-off:** Frontend engineer + DevOps

### Week 12: Production Ready
- [ ] All tests passing (80%+ coverage)
- [ ] Monitoring configured
- [ ] Runbooks complete
- [ ] Security audit passed
- [ ] Pilot customer onboarded
- [ ] **Sign-off:** All stakeholders

---

## Next Steps

1. **Create GitHub repo** using this structure
2. **Add team as collaborators**
3. **Review and approve** IMPLEMENTATION_PLAN.md
4. **Assign owners** for each Phase 1-2-3
5. **Schedule kickoff meeting** for Week 1

---

**Questions?** See [README.md](./README.md) or [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

