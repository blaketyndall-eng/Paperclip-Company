# Deployment & Release Management

**Target Environment:** GCP (App Engine + Cloud SQL) | **Deployment Frequency:** 2x per week | **Downtime SLA:** Zero

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Repository                          │
│  (main branch = production, staging branch = staging env)      │
└─┬───────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions CI/CD                         │
│  1. Run linter, tests, build                                   │
│  2. Push Docker image to Artifact Registry                     │
└─┬───────────────────────────────────────────────────────────────┘
  │
  ├─ (Staging branch) ──► Deploy to staging.app.com
  │                      Run smoke tests
  │                      Manual sign-off before prod
  │
  └─ (main branch) ────► Deploy to production (blue-green)
                         Health checks
                         Gradual rollout (canary)
                         Rollback if needed
```

---

## Environment Setup

### Staging Environment
- **URL:** https://staging.app.com
- **Database:** Separate Cloud SQL (test data)
- **Replicas:** 2 (for redundancy testing)
- **Auto-scaling:** Yes (min 1, max 3 instances)
- **Resources:** 0.5 CPU, 512 MB RAM per instance

### Production Environment
- **URL:** https://app.com
- **Database:** Primary + read replica (multi-zone)
- **Replicas:** 3-10 instances (auto-scale based on load)
- **Auto-scaling:** Yes (min 2, max 50 instances)
- **Resources:** 1 CPU, 1 GB RAM per instance
- **Backup:** Automated daily + hour-long retention

---

## Pre-Deployment Checklist

**Before merging to main:**
- [ ] All tests passing (unit, integration, E2E)
- [ ] Code review approved (2+ approvers)
- [ ] No security alerts from SAST scan
- [ ] No high-severity bugs open
- [ ] Changelog updated
- [ ] Database migrations tested in staging

**Deployment day:**
- [ ] On-call engineer assigned
- [ ] Rollback plan documented
- [ ] Customer-facing comms reviewed
- [ ] Monitoring dashboards loaded
- [ ] Feature flags finalized

---

## Staging Deployment Process

**1. Merge to staging branch**
```bash
git checkout staging
git pull origin staging
git merge origin/feature-branch
git push origin staging
```

**2. GitHub Actions triggered automatically:**
```yaml
on:
  push:
    branches: [staging]

jobs:
  build-and-deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run lint
      - run: npm run test
      - run: npm run build
      - run: gcloud auth configure-docker us-central1-docker.pkg.dev
      - run: docker build -t us-central1-docker.pkg.dev/$GCP_PROJECT/app/backend:$GITHUB_SHA .
      - run: docker push us-central1-docker.pkg.dev/$GCP_PROJECT/app/backend:$GITHUB_SHA
      - run: gcloud app deploy --image-url=us-central1-docker.pkg.dev/$GCP_PROJECT/app/backend:$GITHUB_SHA --service=staging
```

**3. Post-deployment validation:**
```bash
# Smoke tests run automatically
npm run test:smoke:staging

# Check health
curl https://staging.app.com/health -v

# Tail logs for errors
gcloud app logs read --service=staging --limit=50
```

**4. Manual testing (in staging):**
- [ ] Login works
- [ ] Create workflow
- [ ] Trigger workflow run
- [ ] Approve workflow
- [ ] Check audit logs
- [ ] Verify no errors in logs

**5. Sign-off for production:**
```
In #deployments Slack channel:
"Staging deployment successful. Ready for production."
```

---

## Production Deployment (Blue-Green)

**1. Create deployment PR:**
```bash
git checkout main
git pull origin main
git pr create --title "Deploy v1.2.3 to production"
# PR includes:
# - Changelog
# - Any breaking changes
# - Rollback procedure
```

**2. Code review & approval:**
- Requires 2+ approvals
- All CI checks must pass
- No urgent bugs open

**3. Merge to main:**
```bash
git merge --no-ff pr/123
git push origin main
```

**4. GitHub Actions deployment (blue-green):**
```yaml
on:
  push:
    branches: [main]
    tags:
      - 'v*'

jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval
    steps:
      - uses: actions/checkout@v3
      
      # Build new version (green)
      - run: docker build -t us-central1-docker.pkg.dev/$GCP_PROJECT/app/backend:$VERSION .
      - run: docker push us-central1-docker.pkg.dev/$GCP_PROJECT/app/backend:$VERSION
      
      # Deploy to new instances (green)
      - run: |
          gcloud app deploy \
            --image-url=us-central1-docker.pkg.dev/$GCP_PROJECT/app/backend:$VERSION \
            --version=green-$GITHUB_SHA \
            --no-promote  # Don't route traffic yet
      
      # Smoke tests against green
      - run: npm run test:smoke:green
      
      # Gradual traffic shift (canary)
      - run: |
          for percent in 10 25 50 100; do
            gcloud app services set-traffic default \
              --splits=blue=$((100-percent)),green=$percent
            sleep 60
            npm run test:health:canary
          done
      
      # Cleanup old version (blue)
      - run: gcloud app services set-traffic default --splits=green=100
      - run: gcloud app versions delete blue-* --quiet
```

**5. Monitor after deployment:**
- [ ] Error rate < 0.1% for 5 minutes
- [ ] API latency p95 < 500ms
- [ ] Database connections normal
- [ ] No customer support tickets spike

**6. Communicate status:**
```
@channel Deployment of v1.2.3 complete. Monitoring metrics. No issues detected.
```

---

## Rollback Procedure

**If critical issue detected (error rate > 1%):**

```bash
# Option 1: Instant rollback (revert DNS to blue)
gcloud app services set-traffic default --splits=blue=100,green=0

# Option 2: Revert deployment
git revert HEAD  # or git reset --hard HEAD~1
git push origin main
# GitHub Actions redeploys previous version

# Option 3: Manual rollback
gcloud app versions list
gcloud app services set-traffic default --splits=v1-2-2=100

# Notify team
# Message: "Rolled back to v1.2.2 due to [reason]. Investigating."
```

**Rollback criteria:**
- Error rate > 1% sustained for 5+ minutes
- Critical feature broken (approvals, auth, data)
- Data corruption detected
- Security incident

**Rollback SLA:** < 5 minutes (fully rolled back and verified)

---

## Database Migrations

**Strategy:** Backward-compatible migrations only

**Example migration (add column):**
```sql
-- 001-add-workflow-tags.sql
-- Migration: Add optional tags column to workflows table
-- Safe to deploy before code change (code ignores column until released)

BEGIN;

ALTER TABLE workflows ADD COLUMN tags TEXT[] DEFAULT '{}';
CREATE INDEX idx_workflows_tags ON workflows USING GIN(tags);

COMMIT;
```

**In code (backward compatible):**
```typescript
// Old code still works (tags = undefined)
// New code handles tags
const workflow = {
  id: '123',
  name: 'Claims',
  tags: await getWorkflowTags(workflow_id)  // Returns [] if column missing
};
```

**Migration deployment process:**
1. Deploy migration to staging
2. Verify data integrity
3. Backup production database
4. Deploy migration to production
5. Deploy application code that uses new column

---

## Feature Flags & Gradual Rollout

**Mechanism:** LaunchDarkly or custom Redis-backed flags

```typescript
// In code: check feature flag before executing
async function approveWorkflow(run_id: string) {
  if (await featureFlag('enable_auto_approve')) {
    // New feature: auto-approve low-risk workflows
    if (isLowRisk(run)) {
      await autoApprove(run);
      return;
    }
  }
  
  // Fall back to manual approval (old behavior)
  await requestApproval(run);
}
```

**Rollout plan:**
1. Deploy with flag disabled (0%)
2. Enable for internal testing (100% internal)
3. Roll out to 10% of customers
4. Monitor for 24 hours
5. Roll out to 50% of customers
6. Monitor for 24 hours
7. Roll out to 100%
8. Remove flag cleanup (if no issues)

**Kill switch:** Can disable feature instantly if bugs detected
```bash
# Via CLI
ldcli flag update --flag enable_auto_approve --enabled false

# Via dashboard
# https://app.launchdarkly.com/projects/prod/features/enable_auto_approve
```

---

## Observability During Deployment

**Before deployment:**
```bash
# Open monitoring dashboards
# https://grafana.company.com/dashboards/prod

# Check baseline metrics
- Error rate: 0.05%
- API latency p95: 280ms
- Database CPU: 15%
```

**During deployment:**
```bash
# Tail logs in real-time
gcloud app logs read --service=prod --limit=100 --follow

# Check key metrics every 2 minutes
watch -n 2 "gcloud monitoring time-series read --filter='metric.type=http.server.response_latencies'"

# Check application health
curl https://app.com/health -v

# Review error tracking (Sentry)
# https://sentry.io/organizations/company/issues/?level=error
```

**After deployment (1-hour monitoring window):**
- [ ] Error rate remains < 0.1%
- [ ] API latency p95 < 500ms
- [ ] Database CPU remains < 50%
- [ ] No new high-severity issues in Sentry
- [ ] Customer support email quiet

---

## Incident Response During Deployment

**Error rate spikes to 2%**
1. Check error logs: `gcloud app logs read --service=prod --severity=ERROR`
2. If bad deploy: **rollback immediately** (5 min SLA)
3. If it's a real issue: page on-call eng, start incident
4. Communicate status to #incidents Slack channel

**Database connection errors**
1. Check Cloud SQL CPU: `gcloud sql instances describe prod --format=json | jq .currentDiskSize`
2. If near limit: scale up immediately
3. If replication lag: check read replica
4. Rollback if schema migration caused it

**Authentication failures ("Invalid token")**
1. Check if JWT secrets rotated correctly
2. Verify refresh token still work in staging
3. If OAuth keys changed: update Secret Manager
4. Rollback if code change broke auth

---

## Post-Deployment Validation

**1 hour after deployment:**
- [ ] Error rate stable at < 0.1%
- [ ] API latency p95 < 500ms
- [ ] No spike in support tickets
- [ ] Workflow execution success > 99%
- [ ] LLM API calls successful > 98%

**4 hours after deployment:**
- [ ] Database metrics normal
- [ ] No memory leaks (check memory trend)
- [ ] Cache hit rate stable
- [ ] Background jobs queue normal

**24 hours after deployment:**
- [ ] New feature working as expected
- [ ] No data corruption
- [ ] No security anomalies
- [ ] Customer feedback positive (Slack, email)

**Automated validation (smoke tests):**
```bash
# Run after every deployment
npm run test:smoke:prod

# Tests:
# - Can login
# - Can create workflow
# - Can approve workflow
# - Audit logs present
# - API responds within SLA
```

---

## Deployment Timeline Template

```
Deployment of v1.2.3 (Claims Auto-Classify Feature)

Time        Activity                          Assigned To    Status
=========================================================================
2:00 PM     Final staging validation          Alice          ✅
2:05 PM     Code review approval              Bob            ✅
2:10 PM     Merge to main branch              Alice          ✅
2:12 PM     GitHub Actions build              (automated)    ⏳
2:15 PM     Docker image pushed               (automated)    ✅
2:20 PM     Blue-green deploy triggered       (automated)    ⏳
2:22 PM     Green instances healthy           (automated)    ✅
2:25 PM     Smoke tests pass (green)          (automated)    ✅
2:27 PM     Canary traffic shift (10%)        (automated)    ⏳
2:30 PM     Monitor canary (10%)              Charlie        ⏳
2:35 PM     Monitor shows OK; proceed (25%)   Charlie        ✅
2:40 PM     Monitor shows OK; proceed (50%)   Charlie        ✅
2:45 PM     Monitor shows OK; proceed (100%)  Charlie        ✅
2:50 PM     Full traffic on green             (automated)    ✅
2:52 PM     Old version (blue) removed        (automated)    ✅
3:00 PM     Deployment complete; notify team  Alice          ✅
3:15 PM     Continue monitoring (1h check-in) Charlie        ✅
```

---

## Deployment Checklist (Copy & Paste)

```markdown
## Deployment: v[VERSION] - [FEATURE NAME]

### Pre-Deployment (Before Merge)
- [ ] All CI checks pass
- [ ] Code review approved (2+ reviewers)
- [ ] Security scan clean (no high/critical)
- [ ] Database migrations tested in staging
- [ ] Changelog updated with feature description
- [ ] Feature flags configured (if applicable)

### Staging Validation
- [ ] Merged to staging; GitHub Actions running
- [ ] Smoke tests passing on staging
- [ ] Manual testing completed
  - [ ] Login works
  - [ ] Core workflow works
  - [ ] [Feature-specific test]
- [ ] Logs clean (no ERROR or CRITICAL)
- [ ] Performance baseline met (latency < 500ms)

### Production Deployment
- [ ] On-call engineer assigned: [NAME]
- [ ] Monitoring dashboards opened
- [ ] Backup created: [SNAPSHOT_ID]
- [ ] Rollback plan documented
- [ ] Slack notification drafted
- [ ] Merged to main; GitHub Actions running

### Post-Deployment (Every 15 Min for 1 Hour)
- [ ] 15 min: Error rate < 0.1%, latency p95 < 500ms
- [ ] 30 min: DB CPU < 50%, no data anomalies
- [ ] 45 min: Customer support email quiet, no issues
- [ ] 60 min: All metrics stable, feature working as intended

### Sign-Off
- [ ] Monitoring shows success
- [ ] No manual rollback needed
- [ ] Post-deployment validation complete
- [ ] Deployment owner: [NAME]
- [ ] Timestamp: [TIME]
```

---

**Next:** See [RUNBOOK.md](./RUNBOOK.md) for operational procedures and troubleshooting.
