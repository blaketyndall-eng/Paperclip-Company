# Database Schema

Current migrations:

- `001_init_auth.sql`
- `002_init_workflows.sql`
- `003_google_workspace_tokens.sql`

## Auth Tables

- `users`
	- `id UUID PK`
	- `email UNIQUE`
	- `google_id UNIQUE`
	- `roles TEXT[]`
	- timestamps

- `sessions`
	- `id UUID PK`
	- `user_id FK -> users.id`
	- `refresh_token UNIQUE`
	- `expires_at`
	- `created_at`

- `auth_audit_events`
	- `id UUID PK`
	- `user_id FK -> users.id`
	- `action`
	- `metadata JSONB`
	- `created_at`

- `google_workspace_tokens`
	- `id UUID PK`
	- `user_id UNIQUE FK -> users.id`
	- `access_token`
	- `refresh_token`
	- `expires_at`
	- `scope`
	- `created_at`
	- `updated_at`

## Workflow Tables

- `workflows`
	- `id UUID PK`
	- `owner_id FK -> users.id`
	- `name`
	- `template`
	- `status` (`active`, `inactive`)
	- timestamps

- `workflow_runs`
	- `id UUID PK`
	- `workflow_id FK -> workflows.id`
	- `status` (`created`, `pending_approval`, `completed`, `rejected`, `failed`)
	- `trigger_data JSONB`
	- `context JSONB`
	- `created_by FK -> users.id`
	- timestamps

- `workflow_steps`
	- `id UUID PK`
	- `run_id FK -> workflow_runs.id`
	- `step_index`
	- `step_type`
	- `input JSONB`
	- `output JSONB`
	- `status` (`pending`, `in_progress`, `completed`, `failed`, `rejected`)
	- `acted_by FK -> users.id`
	- `acted_at`
	- `created_at`

- `workflow_audit_events`
	- `id UUID PK`
	- `workflow_id FK -> workflows.id`
	- `run_id FK -> workflow_runs.id`
	- `actor_user_id FK -> users.id`
	- `action`
	- `metadata JSONB`
	- `created_at`

## Migration Runner

- Script: `npm run db:migrate --workspace backend`
- Maintains `schema_migrations` table
- Applies unapplied `.sql` files in lexical order
- Uses per-migration transactions

## Integration Test Target

- Run backend integration tests against real Postgres:
	- `npm run test:integration --workspace backend`
	- or from root: `npm run test:integration`
- Provide database connection via:
	- `TEST_DATABASE_URL` (preferred)
	- fallback: `DATABASE_URL`
- If no reachable Postgres is available, integration tests skip gracefully and do not fail CI/local runs.

## Connector Integration Test Target (Staging)

- Run integration tests (includes connector sandbox tests):
	- `npm run test:integration --workspace backend`
	- or from root: `npm run test:integration`
- Enable staging connector tests by setting:
	- `STAGING_GOOGLE_CONNECTORS_ENABLED=true`
	- `STAGING_GOOGLE_CONNECTORS_USER_EMAIL`
	- `STAGING_GOOGLE_CONNECTORS_ACCESS_TOKEN`
	- `STAGING_GOOGLE_CONNECTORS_REFRESH_TOKEN`
- Refresh path verification additionally requires:
	- `GOOGLE_CLIENT_ID`
	- `GOOGLE_CLIENT_SECRET`

## Execution Lifecycle Notes

- New run rows are created with `status='created'`
- `draft_generation` step row is inserted as `pending`
- On success:
	- draft step transitions `pending -> in_progress -> completed`
	- `human_approval` step row is inserted with `status='pending'`
	- run transitions `created -> pending_approval`
- On failure:
	- draft step transitions to `failed`
	- run transitions `created -> failed`
	- failure reason is appended into run `context`

