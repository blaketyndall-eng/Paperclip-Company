# Operational Runbook

**For:** Engineers on-call and SRE team | **Purpose:** Step-by-step procedures for common tasks and emergencies

---

## Quick Reference

### Critical Contacts
- **On-Call Engineer:** [PagerDuty link]
- **Foundr (Escalation):** Blake T. (blake@company.com)
- **Google Cloud Support:** [GCP support ticket]
- **Anthropic Support (LLM):** api-support@anthropic.com

### Key URLs
- **Production Dashboard:** https://app.com
- **Monitoring (Grafana):** https://grafana.company.com/dashboards/prod
- **Logs (Cloud Logging):** https://console.cloud.google.com/logs
- **Error Tracking (Sentry):** https://sentry.io/organizations/company
- **Database (Cloud SQL):** https://console.cloud.google.com/sql/instances
- **GitHub Deployments:** https://github.com/company/app/deployments

---

## Application Health Checks

### Is the App Up?

```bash
# Health endpoint
curl https://app.com/health -v

# Expected:
# HTTP/2 200
# { "status": "healthy", "timestamp": "..." }
```

### Check Error Rate

```bash
# Via Grafana dashboard (real-time)
# https://grafana.company.com/dashboards/prod

# Or via gcloud logs
gcloud logging read "resource.type=app_engine_app AND severity=ERROR" \
  --limit=10 \
  --format=json \
  --project=project-id
```

### Check API Latency

```bash
# Load test endpoint
ab -n 100 -c 10 https://app.com/api/health

# Expected:
# Requests per second:   high (>100)
# Failed requests:       0
# Mean service time:     <100ms
```

### Check Database Connection

```bash
# SSH into App Engine instance
gcloud app instances list
gcloud app instances describe instance-id

# Log into database
gcloud sql connect prod --user=app
SELECT COUNT(*) FROM workflows;

# Check connection pool
SELECT * FROM pg_stat_activity;
```

---

## Common Issues & Solutions

### Issue: High Error Rate (> 1%)

**Symptoms:**
- Sentry shows spike in errors
- Error rate dashboard > 1%
- Customers report "something broken"

**Diagnosis:**
```bash
# 1. Check what changed recently
gcloud logging read "resource.type=app_engine_app" \
  --limit=50 \
  --format="table(timestamp, severity, jsonPayload.message)" \
  --project=project-id

# 2. Check if recent deployment caused it
gcloud app versions list
gcloud app deployments list

# 3. Check for common errors
gcloud logging read 'severity=ERROR' --limit=20

# 4. Check specific service
gcloud logging read 'resource.labels.service_name=prod' --limit=20
```

**Solutions:**

**Option A: Rollback**
```bash
# Get list of recent versions
gcloud app versions list

# Switch traffic to previous version
gcloud app services set-traffic default --splits=v1-0-5=100

# Verify
curl https://app.com/health -v
```

**Option B: Restart instances**
```bash
# Kill unhealthy instances (they'll auto-restart)
gcloud app instances list
gcloud app instances delete instance-id --service=prod
```

**Option C: Scale up to isolate bad instances**
```bash
# Increase min instances
gcloud app update --service prod --min-instances=5
# This prevents problematic instances from handling traffic
```

**Prevention:**
- Always test in staging first
- Have runbook for deployment
- Monitor post-deployment for 1 hour

---

### Issue: Database Connection Errors

**Symptoms:**
- "too many connections" errors in logs
- Slow API responses
- Workflow executions timeout

**Diagnosis:**
```bash
# Check connection pool stats
gcloud sql instances describe prod --format=json | jq '.settings.backupConfiguration'

# Check active connections
gcloud sql connect prod --user=app
SELECT client_addr, usename, COUNT(*) FROM pg_stat_activity GROUP BY client_addr, usename;

# Check for stuck connections
SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state != 'idle';
```

**Solutions:**

**Option A: Increase connection pool size**
```bash
# Update Cloud SQL settings
gcloud sql instances patch prod \
  --database-flags=max_connections=200
```

**Option B: Kill stuck connections**
```bash
# SSH into database
gcloud sql connect prod --user=app

-- Find long-running query
SELECT pid FROM pg_stat_activity WHERE now() - query_start > interval '30 minutes';

-- Kill it
SELECT pg_terminate_backend(pid);
```

**Option C: Restart database**
```bash
# Last resort
gcloud sql instances restart prod

# This will drop all connections and restart immediately
# Expect 2-3 minutes downtime
```

**Prevention:**
- Monitor connection count daily
- Test connection pooling changes in staging
- Set connection timeouts (30s)

---

### Issue: Slow API Response Time (p95 > 1s)

**Symptoms:**
- Latency p95 dashboard shows > 1000ms
- Customers complain "page is slow"
- Database queries taking long

**Diagnosis:**
```bash
# Profile slow requests
gcloud logging read "httpRequest.latency > 1s" \
  --limit=20 \
  --format=json \
  --project=project-id | jq '.[] | {method, uri, latency: .httpRequest.latency}'

# Find slowest endpoints
gcloud logging read "resource.type=app_engine_app" \
  --limit=100 \
  --format=json | jq -s 'sort_by(.httpRequest.latency) | reverse | .[0:10]'

# Check database query performance
gcloud sql connect prod --user=app
SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;

# Check if indexes are missing
EXPLAIN ANALYZE SELECT * FROM workflows WHERE owner_id = $1;
```

**Solutions:**

**Option A: Add database index**
```sql
-- Identify missing index
CREATE INDEX idx_workflows_owner ON workflows(owner_id);

-- Verify it helps
ANALYZE;

-- Check execution plan improved
EXPLAIN ANALYZE SELECT * FROM workflows WHERE owner_id = 'user-123';
```

**Option B: Scale up instances**
```bash
# Increase min/max instances
gcloud app update --service prod --min-instances=5 --max-instances=50

# This spreads load across more CPU
```

**Option C: Clear cache and restart**
```bash
# If Redis cache is stale
gcloud redis instances reboot prod

# Give it 1-2 minutes to restart
```

**Prevention:**
- Regular query performance audits
- Monitor slow query log
- Test load in staging before release

---

### Issue: LLM API Rate Limit (429 Errors)

**Symptoms:**
- Logs show "Rate limit exceeded"
- Workflow runs fail during LLM step
- Error rate spikes at specific times

**Diagnosis:**
```bash
# Check LLM API usage
gcloud logging read 'jsonPayload.agent_type=*' \
  --limit=100 \
  --format=json | jq '[.[] | {agent: .jsonPayload.agent_type, status: .jsonPayload.success}] | group_by(.agent) | map({agent: .[0].agent, count: length, failures: map(select(.status==false)) | length})'

# Check if quota exceeded
# Log into Anthropic dashboard: https://console.anthropic.com/

# Check retry behavior
gcloud logging read 'jsonPayload.retry_attempt > 0' --limit=20
```

**Solutions:**

**Option A: Adjust LLM call concurrency**
```typescript
// In backend code: reduce parallel LLM calls
const MAX_CONCURRENT_LLM_CALLS = 5;  // was 20

// This'll throttle requests
```

**Option B: Implement circuit breaker**
```typescript
// If rate limit detected, pause LLM calls for 1 minute
if (response.status === 429) {
  circuitBreaker.trip();  // Stop new LLM calls
  await sleep(60000);      // Wait 1 minute
  circuitBreaker.reset();
}
```

**Option C: Request quota increase**
```bash
# Contact Anthropic support
# Email: api-support@anthropic.com
# Message: "We're hitting rate limits. Current quota: X calls/min. Request: Y calls/min."
```

**Prevention:**
- Monitor LLM usage daily
- Set up alerts before rate limit hit
- Plan for peak usage times

---

### Issue: Data Export Failing ("Cannot export workflow runs")

**Symptoms:**
- Customer can't export their data
- Export job times out
- "Too many files" error

**Diagnosis:**
```bash
# Check export job status
gcloud tasks describe prod-export-jobs --queue=exports

# Check if export files exist
gsutil ls gs://company-exports/user-abc-123/

# Check export job logs
gcloud logging read 'jsonPayload.job_type=export' \
  --limit=10 \
  --format=json

# Check if S3 bucket has space
gsutil du gs://company-exports/
```

**Solutions:**

**Option A: Increase file size limit**
```bash
# If many workflows, export may exceed memory
# Split export into smaller batches

const BATCH_SIZE = 100;  // Export 100 workflows per file
```

**Option B: Archive old data**
```bash
# Move workflows > 1 year old to cold storage
gsutil mv gs://company-exports/old-data/* gs://company-cold-storage/

# Frees up space for new exports
```

**Option C: Trigger manual export**
```bash
# If automated export fails, trigger manually
gcloud tasks create-http-task prod-export-run \
  --header content-type=application/json \
  --oidc-service-account-email=app@project.iam.gserviceaccount.com \
  --oidc-token-audience=https://prod.company.com \
  --uri="https://prod.company.com/api/admin/export-user?user_id=user-abc-123" \
  --method=POST
```

**Prevention:**
- Test exports with large data sets
- Monitor export job queue
- Set up alerts for failed exports

---

## Daily Operations

### Morning Health Check (9 AM)

```bash
#!/bin/bash
# Daily health check script

echo "=== Checking App Health ==="
curl https://app.com/health

echo "\n=== Error Rate (last hour) ==="
gcloud logging read "severity=ERROR" \
  --limit=5 \
  --format="table(timestamp, jsonPayload.message)"

echo "\n=== Database Status ==="
gcloud sql instances describe prod | grep state

echo "\n=== Recent Deployments ==="
gcloud app deployments list --limit=3

echo "\n=== Alerts ==="
# Check monitoring dashboards
echo "See: https://grafana.company.com/dashboards/prod"
```

### Weekly Checklist

- [ ] Review error logs for trends
- [ ] Check database backup status
- [ ] Validate disaster recovery plan
- [ ] Review and update runbook
- [ ] Check SSL certificate expiry (>30 days remaining)
- [ ] Review customer support issues

### Monthly Audit

- [ ] Run penetration test in staging
- [ ] Verify audit logs are immutable
- [ ] Check data export path works
- [ ] Review and rotate secrets
- [ ] Disaster recovery drill (test restore)
- [ ] Performance baseline check

---

## Disaster Recovery

### Scenario: Database Corrupted

**Recovery Steps:**
```bash
# 1. Create new Cloud SQL instance from backup
gcloud sql backups list --instance=prod
gcloud sql backups restore BACKUP_ID --backup-instance=prod --target-instance=prod-restored

# 2. Validate data integrity
gcloud sql connect prod-restored --user=app
SELECT COUNT(*) FROM workflows;
SELECT COUNT(*) FROM audit_events;

# 3. Run consistency tests
npm run test:data-integrity

# 4. Switch traffic to restored instance
# Update environment variables
gcloud app deploy --env-vars DATABASE_URL=new-connection-string

# 5. Verify
npm run test:smoke:prod
```

**Prevention:**
- Daily automated backups
- Test restore monthly
- Monitor backup size

---

### Scenario: Customer Data Privacy Breach

**Immediate Actions:**
1. **Stop the bleeding:** Identify and isolate the compromise
   ```bash
   gcloud app instances delete affected-instance-id
   ```

2. **Assess impact:** Which customer data was exposed?
   ```bash
   gcloud logging read "jsonPayload.sensitive=true" --limit=100
   ```

3. **Secure all systems:**
   ```bash
   # Rotate all credentials
   gcloud secrets versions add DATABASE_PASSWORD --data-file=random.txt
   gcloud secrets versions add API_KEY_ANTHROPIC --data-file=random.txt
   
   # Restart application
   gcloud app update --service prod
   ```

4. **Notify customers:** (Legal to send)
   - Time of breach
   - What data exposed
   - What we're doing about it
   - What customers should do

5. **Post-mortem:** Document root cause and prevention

**Prevention:**
- PII redaction in all logs
- Encryption at rest + in transit
- Regular security audits
- Principle of least privilege (minimal data access)

---

## Backup & Restore

### Create On-Demand Backup

```bash
# Create backup
gcloud sql backups create \
  --instance=prod \
  --description="Manual backup before migration"

# List backups
gcloud sql backups list --instance=prod

# Restore from backup
gcloud sql backups restore BACKUP_ID \
  --backup-instance=prod \
  --target-instance=prod-restore-test
```

### Test Restore Weekly

```bash
#!/bin/bash
# Weekly restore test

BACKUP_ID=$(gcloud sql backups list --instance=prod --limit=1 --format="value(name)")
gcloud sql backups restore $BACKUP_ID --backup-instance=prod --target-instance=prod-test-restore

# Wait for restore
sleep 60

# Verify data
gcloud sql connect prod-test-restore --user=app << EOF
SELECT COUNT(*) as workflow_count FROM workflows;
SELECT COUNT(*) as audit_count FROM audit_events;
EOF

# Cleanup
gcloud sql instances delete prod-test-restore --quiet
```

---

## Maintenance Windows

### Before Scheduled Maintenance

**1. Notify customers** (72 hours notice)
```email
From: support@company.com
To: all-pilots@company.com
Subject: Scheduled Maintenance - Saturday 2-3 AM UTC

During this time, the platform will be unavailable while we perform critical database maintenance.

Impact: Workflow runs will be paused. Approvals can resume after.
Time: Saturday 2-3 AM UTC (your local time: [CONVERT])
```

**2. Prepare**
```bash
# Backup before window
gcloud sql backups create --instance=prod --description="Pre-maintenance backup"

# Test rollback plan
npm run test:rollback

# Brief on-call team
echo "Maintenance window scheduled 2-3 AM. On-call: [NAME]. Slack: [LINK]"
```

**3. Execute maintenance**
```bash
# Take down gracefully
gcloud app update --service prod --min-instances=0  # Drain load

# Do maintenance (DB upgrade, schema change)
# ...

# Bring back up
gcloud app update --service prod --min-instances=2
```

**4. Verify**
```bash
curl https://app.com/health
npm run test:smoke:prod
```

---

## Contact & Escalation

| Issue | First Contact | Escalation |
|-------|---|---|
| API latency high | On-call engineer | SRE lead |
| Database down | On-call engineer | DBA |
| Security incident | On-call engineer | CTO |
| Customer complaint | Support team | Product lead |
| LLM API down | On-call engineer | Anthropic support |

**Escalation Process:**
1. Page on-call via PagerDuty
2. If unresolved in 15 min, page manager
3. If unresolved in 30 min, page director

**After-Hours Support:**
- PagerDuty: https://company.pagerduty.com
- Slack: #incidents (auto-posts incidents)
- Phone: On-call number in Slack

---

## Troubleshooting Template

Use this template when investigating issues:

```markdown
## Issue: [TITLE]

**Time Reported:** [UTC TIMESTAMP]
**Severity:** [P0/P1/P2/P3]

### Symptoms
- [What customers/systems observed]

### Initial Assessment
1. [ ] Health check passed/failed
2. [ ] Error rate normal/elevated
3. [ ] Recent changes? (check deployment log)

### Diagnosis
- [ ] Checked logs for errors
- [ ] Checked database connections
- [ ] Checked API latency
- [ ] Checked external service (Google, Anthropic)

### Root Cause
[What actually caused it]

### Solution
[Steps taken to fix]

### Prevention
[What to do to prevent recurrence]

### Resolution Time
[Started: HH:MM] → [Resolved: HH:MM] (Duration: X min)

### Post-Mortem
- [ ] Root cause analysis complete
- [ ] Prevention implemented
- [ ] Runbook updated
- [ ] Team debriefing scheduled
```

---

## References

- **GCP Documentation:** https://cloud.google.com/docs
- **App Engine Docs:** https://cloud.google.com/appengine/docs
- **Cloud SQL Docs:** https://cloud.google.com/sql/docs
- **Anthropic API Docs:** https://docs.anthropic.com
- **PostgreSQL Docs:** https://www.postgresql.org/docs

---

**Last Updated:** 2026-04-02 | **Next Review:** 2026-05-02
