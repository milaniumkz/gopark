# GoPark

Production monorepo for the GoPark platform:

- `CRM Web` for admin, finance, operator, manager, auditor
- `Driver App` for drivers
- `Manager App` for mobile brigade/manager workflows
- `Backend Platform` with financial core, integrations, and audit

Production CRM: http://185.138.185.36:3000

Cloud workflow and deploy runbook: [docs/cloud-workflow.md](docs/cloud-workflow.md)

## Quick Start

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @gopark/api typecheck
corepack pnpm --filter @gopark/crm-web typecheck
corepack pnpm --filter @gopark/crm-web build
```

Local infrastructure:

```bash
cp .env.example .env
docker compose up -d postgres redis
corepack pnpm --filter @gopark/api db:generate
corepack pnpm --filter @gopark/api db:migrate:deploy
corepack pnpm --filter @gopark/api db:seed
corepack pnpm dev:api
```

CRM dev server:

```bash
corepack pnpm dev:crm
```

## Stack

- CRM Web: React + Vite + TypeScript
- Mobile Apps: Flutter
- Backend: NestJS
- Database: PostgreSQL
- Cache / jobs: Redis + BullMQ planned for async production flows
- Object storage: S3-compatible storage

## Repository Layout

```text
apps/
  api/              NestJS backend
  crm-web/          React CRM dashboard
  driver-app/       Flutter driver app
  manager-app/      Flutter manager app
packages/
  contracts/        Shared API contracts and domain types
docs/
  architecture.md   Production architecture and domain boundaries
```

## Product Principles

- Financial data is owned by the backend only.
- Ledger is the single source of truth for money movements.
- Debt is always calculated on the server.
- Webhooks are normalized, deduplicated, and audited before applying side effects.
- UI follows the approved Figma design direction, while business logic follows the technical specification.

## Next Build Order

1. Finalize domain model, RBAC matrix, and OpenAPI contracts.
2. Implement backend modules and migrations.
3. Recreate Figma CRM screens in `apps/crm-web`.
4. Build Flutter driver and manager flows against the shared API.
5. Add CI/CD, observability, and security hardening.

## Implemented Areas

- backend modular API skeleton
- production database shape and Prisma schema
- runtime-switching repository layer with `in-memory` and `prisma` modes
- CRM shell with admin sections
- Flutter shells for driver and manager
- finance workflow, approvals, outbox, and worker bootstrap
- mobile driver/manager read APIs backed by shared mobile read facade

## Runtime Configuration

- CRM Web: `VITE_API_BASE_URL` defaults to `/api`
- Flutter apps: `--dart-define=API_BASE_URL=http://host:3000/api`
- Flutter bootstrap flow:
  - apps call `POST /api/auth/login`
  - then reuse `accessToken` from the login response as `Authorization: Bearer ...`
  - `requestUserId` / `requestUserRole` remain in session for local role binding and scoped route params
  - current demo clients keep this session only in memory
- CRM bootstrap flow:
  - web calls `POST /api/auth/login`
  - then reuses `accessToken` from the login response as `Authorization: Bearer ...`
  - session is stored in browser `localStorage`
  - CRM accepts only web roles: `owner`, `admin`, `finance`, `manager`, `operator`, `auditor`
  - navigation and routes are client-gated against the backend role matrix
  - page-level actions are also gated against backend mutation roles
  - read-only pages now show explicit role notices instead of silently hiding every restricted action
  - key CRM list/workflow screens now render contextual empty states instead of generic `Нет данных`
  - CRM detail and registry-read screens now return contextual empty states with a clear way back to the source list
  - CRM dashboard and detail cards now expose role-safe contextual links to related sections
  - dashboard also surfaces role-aware quick actions for the operations the current role can actually start
  - dashboard export entry is no longer a dead button and now follows role-aware routing into reports
  - remaining readonly CRM pages now also use contextual empty states instead of generic placeholders
  - key CRM page copy is kept aligned with actual implemented API-backed behavior instead of future-tense placeholders
  - reports page can export the current aggregated snapshot to CSV without extra dependencies
  - ledger page can also export the current journal snapshot to CSV
  - audit page can export the current audit log snapshot to CSV
  - notifications page can export the current delivery log snapshot to CSV
  - incidents page can export the current operational cases snapshot to CSV
  - users page can export the current admin/user registry snapshot to CSV
  - payments page can export the current incoming payments journal to CSV
  - payouts page can export the current withdrawal approvals queue to CSV
  - contracts page can export the current installment contracts registry to CSV
  - drivers page can export the current filtered driver registry to CSV
  - vehicles page can export the current filtered fleet registry to CSV
  - driver detail page can export the current driver card snapshot to CSV
  - vehicle detail page can export the current vehicle card snapshot to CSV
  - contract detail page can export the current contract card snapshot to CSV
  - dashboard page can export the current overview snapshot for the selected period to CSV
  - outbox page can export the current async events queue to CSV
- API runtime modes:
  - `APP_RUNTIME=api` starts the HTTP API surface
  - `APP_RUNTIME=worker` starts the BullMQ-backed outbox worker runtime
  - `in-memory` mode starts without `DATABASE_URL`
  - `prisma` mode requires `DATABASE_URL` and installed `@prisma/client`
- `REDIS_URL` is currently optional for the running API path
- `REDIS_URL` becomes required for the BullMQ-backed worker runtime
- when Cloud Run API publishes directly to a private Redis instance, it also needs a Serverless VPC connector
- production guardrails:
  - `ALLOW_INSECURE_BOOTSTRAP_AUTH` defaults to `false` in `production`
  - `AUTH_TOKEN_SECRET` is required for production-ready bearer auth
  - production deploys should inject `AUTH_TOKEN_SECRET` and `DATABASE_URL` from Secret Manager
  - `ALLOW_IN_MEMORY_PRODUCTION` defaults to `false`
  - API now fails fast on unsafe production startup combinations
- API readiness helpers:
  - `pnpm --filter @gopark/api verify:offline`
  - `pnpm --filter @gopark/api verify:runtime`
  - `pnpm --filter @gopark/api verify:production-readiness`
  - `pnpm --filter @gopark/api verify:openapi`
  - `pnpm --filter @gopark/api verify:openapi-security`
  - `pnpm --filter @gopark/api verify:mobile-surface`
  - `pnpm --filter @gopark/api verify:mobile-contract-dtos`
  - `pnpm --filter @gopark/api verify:mobile-auth-bootstrap`
  - `pnpm --filter @gopark/api verify:mobile-auth-roles`
  - `pnpm --filter @gopark/api verify:crm-auth-bootstrap`
  - `pnpm --filter @gopark/api verify:crm-auth-roles`
  - `pnpm --filter @gopark/api verify:crm-route-access`
  - `pnpm --filter @gopark/api verify:crm-action-access`
  - `pnpm --filter @gopark/api verify:crm-readonly-notices`
  - `pnpm --filter @gopark/api verify:crm-empty-states`
  - `pnpm --filter @gopark/api verify:crm-detail-empty-states`
  - `pnpm --filter @gopark/api verify:crm-context-links`
  - `pnpm --filter @gopark/api verify:crm-dashboard-actions`
  - `pnpm --filter @gopark/api verify:crm-dashboard-export`
  - `pnpm --filter @gopark/api verify:crm-readonly-pages-empty-states`
  - `pnpm --filter @gopark/api verify:crm-page-copy`
  - `pnpm --filter @gopark/api verify:crm-reports-export`
  - `pnpm --filter @gopark/api verify:crm-ledger-export`
  - `pnpm --filter @gopark/api verify:crm-audit-export`
  - `pnpm --filter @gopark/api verify:crm-notifications-export`
  - `pnpm --filter @gopark/api verify:crm-incidents-export`
  - `pnpm --filter @gopark/api verify:crm-users-export`
  - `pnpm --filter @gopark/api verify:crm-payments-export`
  - `pnpm --filter @gopark/api verify:crm-payouts-export`
  - `pnpm --filter @gopark/api verify:crm-contracts-export`
  - `pnpm --filter @gopark/api verify:crm-drivers-export`
  - `pnpm --filter @gopark/api verify:crm-vehicles-export`
  - `pnpm --filter @gopark/api verify:crm-driver-detail-export`
  - `pnpm --filter @gopark/api verify:crm-vehicle-detail-export`
  - `pnpm --filter @gopark/api verify:crm-contract-detail-export`
  - `pnpm --filter @gopark/api verify:crm-dashboard-overview-export`
  - `pnpm --filter @gopark/api verify:crm-outbox-export`
  - `pnpm --filter @gopark/api verify:controller-signatures`
  - `pnpm --filter @gopark/api verify:controller-roles`
  - `pnpm --filter @gopark/api verify:public-route-allowlist`
  - `pnpm --filter @gopark/api verify:notification-catalog`
  - `pnpm --filter @gopark/api verify:auth-principal-mapping`
  - `pnpm --filter @gopark/api verify:auth-session-hardening`
  - `pnpm --filter @gopark/api verify:auth-rate-limiting`
  - `pnpm --filter @gopark/api verify:worker-runtime`
  - `pnpm --filter @gopark/api verify:settings-catalog`
  - `pnpm --filter @gopark/api verify:settings-values`
  - `pnpm --filter @gopark/api verify:status-request-catalog`
  - `pnpm --filter @gopark/api auth:hash <password>`
  - `pnpm --filter @gopark/api db:migrate:deploy`
  - `pnpm --filter @gopark/api db:seed`
  - `bash scripts/build_api_db_bootstrap_sql.sh`
  - `bash scripts/prepare_api_prisma_runtime.sh`
  - `bash scripts/provision_outbox_worker_runtime.sh`
  - `bash scripts/deploy_outbox_worker_cloud_run.sh`
- production roadmap: [docs/production-plan.md](/Volumes/PD1000/job/GoPark/docs/production-plan.md)
- Firebase/GCP deploy runbook: [docs/firebase-gcp-deploy.md](/Volumes/PD1000/job/GoPark/docs/firebase-gcp-deploy.md)
- API auth:
  - primary path is `Authorization: Bearer <accessToken>`
  - non-production fallback can still use:
    - `x-user-id`
    - `x-role`
  Protected routes no longer fall back to `admin`.

## Health

- `GET /api/health` returns:
  - `status`
  - `service`
  - `mode`
  - `prismaEnabled`
  - `databaseUrlConfigured`
  - `prismaClientAvailable`
  - `redisConfigured`
