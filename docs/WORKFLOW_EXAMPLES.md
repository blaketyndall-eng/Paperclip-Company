# Workflow Examples

## Claims Intake (MVP)

1. Trigger: New email in shared inbox
2. Extract key fields from message
3. Draft response and summary
4. Human approval step (`pending_approval`)
5. Write output to Google Docs and tracker

Run state transitions currently implemented:

- `pending_approval -> completed` (approver/admin approves)
- `pending_approval -> rejected` (approver/admin rejects)

Audit actions recorded:

- `run_created`
- `run_approved`
- `run_rejected`

## Vendor Intake (Future)

1. Trigger: Form submission
2. Validate required fields
3. Route to approver
4. Update onboarding tracker
