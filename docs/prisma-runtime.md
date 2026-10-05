# Prisma Runtime Transition

## Current State

- Prisma CLI scripts in `apps/api/package.json`
- Prisma schema already present
- Prisma service now supports runtime detection of `DATABASE_URL` and `@prisma/client`
- Prisma repository adapters for:
  - drivers
  - cars
  - contracts
  - payments
  - payouts
  - obligations
  - ledger
  - audit
  - notifications
  - outbox
  - status requests
  - incidents
  - users
  - settings
  - manager alerts
  - quick actions
- repository factory switches to Prisma when runtime is actually configured, not by `NODE_ENV`
- schema is aligned with SQL migrations via `@@map` / `@map`
- bootstrap/runtime scripts exist:
  - `verify:runtime`
  - `db:seed`
  - `auth:hash`
- health endpoint exposes runtime mode and Prisma readiness flags

## Runtime Modes

- `in-memory`
  - starts without `DATABASE_URL`
  - uses seed/in-memory repositories
- `prisma`
  - requires `DATABASE_URL`
  - requires installed `@prisma/client`
  - uses Prisma-backed repositories

## What is still missing

- installed runtime dependencies in the current environment
- generated Prisma client
- actual migration execution against a reachable database
- transaction wrappers for financial multi-write flows
- CI/CD execution of migrations, seed, typecheck, and tests
