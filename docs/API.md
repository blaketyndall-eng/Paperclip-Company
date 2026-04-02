# API Specification

## Base URL

- Development: http://localhost:4000/api

## Contract Endpoint

- `GET /docs/openapi.json`
  - Returns machine-readable OpenAPI contract used by clients and tests.
  - Source file in repo: `docs/openapi.json`

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
    - `refreshToken: string`
    - `user: { id, email, displayName, roles, createdAt, updatedAt }`

- `POST /auth/refresh`
  - Body:
    - `refreshToken: string`
  - Rotates refresh token and returns a new JWT.
  - Response:
    - `token: string`
    - `refreshToken: string`
    - `user: { id, email, displayName, roles, createdAt, updatedAt }`

- `POST /auth/logout`
  - Body:
    - `refreshToken: string`
  - Invalidates the refresh session and writes logout audit event.

- `GET /auth/me`
  - Returns decoded JWT user context.

- `GET /auth/admin/audit-events?userId=<optional>`
  - Requires role: `admin`.
  - Returns auth audit events.

## Workflows

- Draft generation provider chain:
  - Supports `anthropic`, `openai`, and `gemini` connectors.
  - Provider order is configured by `LLM_PROVIDER_ORDER`.
  - If no provider credentials are configured, the system falls back to the local draft stub.

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

- `POST /runs/:runId/export`
  - Access: owner of workflow or `admin`
  - Returns export payload for the run:
    - `run`
    - `steps[]`
    - `auditEvents[]`
    - `exportedAt`

## Google Connectors

- `GET /connectors/gmail/messages`
  - Access: any authenticated user
  - Query:
    - `labelIds` (comma-separated)
    - `maxResults`
  - Returns minimal Gmail message descriptors.

- `POST /connectors/gmail/messages/:messageId/labels`
  - Roles: `admin`, `operator`
  - Body:
    - `addLabelIds?: string[]`
    - `removeLabelIds?: string[]`
  - Applies Gmail labels with connector retry handling.

- `GET /connectors/drive/files`
  - Access: any authenticated user
  - Query:
    - `folderId?`
    - `pageSize?`
  - Returns Drive files for folder scope.

- `POST /connectors/drive/folders`
  - Roles: `admin`, `operator`
  - Body:
    - `name: string`
    - `parentFolderId?: string`
  - Creates Drive folder with connector retry handling.

## Observability

- `GET /metrics`
  - Role: `admin`
  - Returns in-memory metrics snapshot including request counts, errors, and p95 latency.

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

## OpenAPI Coverage Note

The contract in `docs/openapi.json` covers the core implemented auth/workflow endpoints and should be updated whenever route signatures, request bodies, or response statuses change.
