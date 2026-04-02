# Workflow Examples

## Claims Intake (MVP)

1. Trigger: New email in shared inbox
2. Create run with status `created`
3. Execute `draft_generation` step
	- Step status progression: `pending -> in_progress -> completed`
4. Create `human_approval` step with status `pending`
5. Move run status to `pending_approval`
6. Approver action
	- Approve path: run `pending_approval -> completed`
	- Reject path: run `pending_approval -> rejected`
7. Write output to Google Docs and tracker (next phase)

Run state transitions currently implemented:

- `created -> pending_approval` (after draft step completion)
- `pending_approval -> completed` (approver/admin approves)
- `pending_approval -> rejected` (approver/admin rejects)
- `created -> failed` (draft step fails)

Audit actions recorded:

- `run_created`
- `draft_generated`
- `run_pending_approval`
- `run_failed`
- `run_approved`
- `run_rejected`

### Failure path behavior (explicit)

The execution service includes a deterministic stub failure branch:

- If `triggerData.forceFailure === true`, the `draft_generation` step is marked `failed`
- Run status becomes `failed`
- Run context receives `failureReason`
- `run_failed` audit event is recorded

## Vendor Intake (Future)

1. Trigger: Form submission
2. Validate required fields
3. Route to approver
4. Update onboarding tracker
