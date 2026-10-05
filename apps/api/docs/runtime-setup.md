# API Runtime Setup

## Preconditions

- workspace dependencies are installed
- `@prisma/client`, `prisma`, `ts-node`, `typescript` are available

`DATABASE_URL` is required only for Prisma-backed runtime. In production, prefer injecting it from Secret Manager rather than storing the raw value directly in Cloud Run env config.

`REDIS_URL` is optional for `APP_RUNTIME=api`, but required for `APP_RUNTIME=worker` because BullMQ-backed outbox processing depends on Redis.
When `APP_RUNTIME=api` also publishes BullMQ jobs to a private Redis instance, the hosting platform still needs network access to that Redis endpoint, for example a Serverless VPC connector on Cloud Run.

`AUTH_TOKEN_SECRET` is optional only outside `production`; production bearer auth should always provide it explicitly, preferably through Secret Manager.

## Verify Environment

Run:

```bash
pnpm --filter @gopark/api verify:offline
pnpm --filter @gopark/api verify:runtime
pnpm --filter @gopark/api verify:production-readiness
```

This check also validates that `apps/api/.env.example` covers the current config environment keys.
`verify:production-readiness` is stricter and is expected to fail until Prisma-backed production runtime and remaining auth hardening are ready.

Route contract check:

```bash
pnpm --filter @gopark/api verify:openapi
```

OpenAPI security check:

```bash
pnpm --filter @gopark/api verify:openapi-security
```

Mobile surface check:

```bash
pnpm --filter @gopark/api verify:mobile-surface
```

Mobile contract DTO check:

```bash
pnpm --filter @gopark/api verify:mobile-contract-dtos
```

Mobile auth bootstrap check:

```bash
pnpm --filter @gopark/api verify:mobile-auth-bootstrap
```

Mobile auth role check:

```bash
pnpm --filter @gopark/api verify:mobile-auth-roles
```

CRM auth bootstrap check:

```bash
pnpm --filter @gopark/api verify:crm-auth-bootstrap
```

CRM auth role check:

```bash
pnpm --filter @gopark/api verify:crm-auth-roles
```

Auth session hardening check:

```bash
pnpm --filter @gopark/api verify:auth-session-hardening
```

Auth rate limiting check:

```bash
pnpm --filter @gopark/api verify:auth-rate-limiting
```

Worker runtime check:

```bash
pnpm --filter @gopark/api verify:worker-runtime
```

Provision Cloud Run worker runtime:

```bash
bash scripts/provision_outbox_worker_runtime.sh
```

Deploy Cloud Run worker runtime:

```bash
bash scripts/deploy_outbox_worker_cloud_run.sh
```

CRM route access check:

```bash
pnpm --filter @gopark/api verify:crm-route-access
```

CRM action access check:

```bash
pnpm --filter @gopark/api verify:crm-action-access
```

CRM readonly notices check:

```bash
pnpm --filter @gopark/api verify:crm-readonly-notices
```

CRM empty states check:

```bash
pnpm --filter @gopark/api verify:crm-empty-states
```

CRM detail empty states check:

```bash
pnpm --filter @gopark/api verify:crm-detail-empty-states
```

CRM context links check:

```bash
pnpm --filter @gopark/api verify:crm-context-links
```

CRM dashboard actions check:

```bash
pnpm --filter @gopark/api verify:crm-dashboard-actions
```

CRM dashboard export check:

```bash
pnpm --filter @gopark/api verify:crm-dashboard-export
```

CRM readonly pages empty states check:

```bash
pnpm --filter @gopark/api verify:crm-readonly-pages-empty-states
```

CRM page copy check:

```bash
pnpm --filter @gopark/api verify:crm-page-copy
```

CRM reports export check:

```bash
pnpm --filter @gopark/api verify:crm-reports-export
```

CRM ledger export check:

```bash
pnpm --filter @gopark/api verify:crm-ledger-export
```

CRM audit export check:

```bash
pnpm --filter @gopark/api verify:crm-audit-export
```

CRM notifications export check:

```bash
pnpm --filter @gopark/api verify:crm-notifications-export
```

CRM incidents export check:

```bash
pnpm --filter @gopark/api verify:crm-incidents-export
```

CRM users export check:

```bash
pnpm --filter @gopark/api verify:crm-users-export
```

CRM payments export check:

```bash
pnpm --filter @gopark/api verify:crm-payments-export
```

CRM payouts export check:

```bash
pnpm --filter @gopark/api verify:crm-payouts-export
```

CRM contracts export check:

```bash
pnpm --filter @gopark/api verify:crm-contracts-export
```

CRM drivers export check:

```bash
pnpm --filter @gopark/api verify:crm-drivers-export
```

CRM vehicles export check:

```bash
pnpm --filter @gopark/api verify:crm-vehicles-export
```

CRM driver detail export check:

```bash
pnpm --filter @gopark/api verify:crm-driver-detail-export
```

CRM vehicle detail export check:

```bash
pnpm --filter @gopark/api verify:crm-vehicle-detail-export
```

CRM contract detail export check:

```bash
pnpm --filter @gopark/api verify:crm-contract-detail-export
```

CRM dashboard overview export check:

```bash
pnpm --filter @gopark/api verify:crm-dashboard-overview-export
```

CRM outbox export check:

```bash
pnpm --filter @gopark/api verify:crm-outbox-export
```

Controller signature check:

```bash
pnpm --filter @gopark/api verify:controller-signatures
```

Controller roles check:

```bash
pnpm --filter @gopark/api verify:controller-roles
```

Public route allowlist check:

```bash
pnpm --filter @gopark/api verify:public-route-allowlist
```

Notification catalog check:

```bash
pnpm --filter @gopark/api verify:notification-catalog
```

Auth principal mapping check:

```bash
pnpm --filter @gopark/api verify:auth-principal-mapping
```

Settings catalog check:

```bash
pnpm --filter @gopark/api verify:settings-catalog
```

Settings values check:

```bash
pnpm --filter @gopark/api verify:settings-values
```

Status request catalog check:

```bash
pnpm --filter @gopark/api verify:status-request-catalog
```

Expected minimum readiness:

- `readyForBaseApiStartup: true`

Expected Prisma readiness:

- `databaseUrl: true`
- `prismaClient: true`
- `prismaCli: true`
- `tsNode: true`
- `typescript: true`

## Apply Database Setup

1. Generate Prisma client

```bash
pnpm --filter @gopark/api db:generate
```

2. Apply Prisma migrations in production-safe mode

```bash
pnpm --filter @gopark/api db:migrate:deploy
```

3. Apply SQL/bootstrap setup from:

- `apps/api/database/migrations/0001_init.sql`
- `apps/api/database/migrations/0002_platform_tables.sql`
- `apps/api/database/migrations/0003_manager_scope.sql`

To build a single importable SQL file:

```bash
bash scripts/build_api_db_bootstrap_sql.sh
```

4. Bootstrap runtime data

```bash
pnpm --filter @gopark/api db:seed
```

Or run the full bootstrap sequence in one command:

```bash
bash scripts/prepare_api_prisma_runtime.sh
```

This seeds:

- `settings`
- `manager_alerts`
- `quick_actions`
- hashed bootstrap users

## Verify Code Health

```bash
pnpm --filter @gopark/api typecheck
pnpm --filter @gopark/api test
```

## Generate Password Hashes

To create a hash compatible with `AuthService` password verification:

```bash
pnpm --filter @gopark/api auth:hash my-secret-password
```

The result can be stored in `users.password_hash`.
