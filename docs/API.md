# API Specification

## Base URL

- Development: http://localhost:4000/api

## Authentication

- Auth scheme: `Authorization: Bearer <jwt>`
- JWT claims used by API:
  - `sub`: user id
  - `email`: user email
  - `roles`: array of roles (`admin`, `approver`, `operator`, `viewer`)

## Health

- `GET /health`
  - Returns service health and timestamp.

## OAuth (Google)

- `GET /auth/google`
  - Returns OAuth authorization URL.
  - Response:
    - `authorizationUrl: string`

- `GET /auth/google/callback?code=<auth_code>`
  - Performs Google token exchange and userinfo fetch.
  - Upserts user in Postgres.
  - Creates refresh session in Postgres.
  - Writes auth audit event.
  - Response:
    - `token: string`
    - `user: { id, email, displayName, roles, createdAt, updatedAt }`

- `GET /auth/me`
  - Returns decoded JWT user context.

- `GET /auth/admin/audit-events?userId=<optional>`
  - Requires role: `admin`.
  - Returns auth audit events.

## Workflows

- `POST /workflows`
  - Roles: `admin`, `operator`, `approver`
  - Body:
    - `name: string`
    - `template: string`
  - Response:
    - `workflow`

- `GET /workflows`
  - Returns workflows for authenticated owner (`sub`).

- `POST /workflows/:workflowId/execute`
  - Roles: `admin`, `operator`, `approver`
  - Body:
    - `triggerData?: object`
    - `context?: object`
  - Creates run with status `pending_approval`.
  - Response:
    - `run`

- `GET /workflows/:workflowId/runs`
  - Access: owner or `admin`
  - Returns runs for workflow.

- `PUT /runs/:runId/approve`
  - Roles: `admin`, `approver`
  - Body:
    - `metadata?: object`
  - Valid transition: `pending_approval -> completed`

- `PUT /runs/:runId/reject`
  - Roles: `admin`, `approver`
  - Body:
    - `metadata?: object`
  - Valid transition: `pending_approval -> rejected`

- `GET /runs/:runId/audit`
  - Access: owner of workflow or `admin`
  - Returns run-scoped workflow audit events.

## Standard Error Shape

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message"
}
```

Known workflow service errors:

- `INVALID_INPUT` (400)
- `WORKFLOW_NOT_FOUND` (404)
- `RUN_NOT_FOUND` (404)
- `FORBIDDEN` (403)
- `INVALID_RUN_STATE` (409)
- `INTERNAL_SERVER_ERROR` (500)
