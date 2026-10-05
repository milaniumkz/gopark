# GoPark Production Architecture

## Chosen Platform

- `apps/api`: NestJS backend, modular monolith first, extraction-ready by domain
- `apps/crm-web`: React CRM mirroring the approved Figma structure
- `apps/driver-app`: Flutter driver application
- `apps/manager-app`: Flutter manager application
- `PostgreSQL`: transactional storage
- `Redis + BullMQ`: planned async layer for retries, delayed tasks, and background consumers

## Why Modular Monolith First

The technical specification is enterprise-grade, but the repository is empty. The correct production starting point is a strict modular monolith with hard domain boundaries:

- simpler deployment and observability than premature microservices
- transactional consistency for financial flows
- cleaner extraction path for `integrations`, `notifications`, and `reporting` later

## Backend Domains

### Platform

- `auth`
- `rbac`
- `audit`
- `notifications`
- `files`
- `health`

### Core Operations

- `drivers`
- `cars`
- `contracts`
- `manager-groups`
- `statuses`

### Financial Core

- `ledger`
- `payments`
- `payouts`
- `debt-engine`
- `billing-rules`

### Integration Layer

- `bakai`
- `yandex`
- `webhooks`

### Read / Analytics

- `dashboard`
- `reports`
- `exports`

## Architectural Rules

- All money movements are represented by immutable ledger entries.
- Debt is derived from obligations, payments, adjustments, and payout effects.
- External events enter through inbox normalization and idempotency checks.
- Write models and reporting models are separated logically, and later can be separated physically.
- Sensitive actions must emit audit events with actor, target, diff, and correlation id.

## Deployment Shape

### Runtime services

- `api`
- `postgres` for Prisma-backed runtime
- `redis` optional in the current bootstrap deployment
- `object-storage`
- `reverse-proxy`
- `observability stack`

### Runtime behavior

- `api` can run in `in-memory` mode for bootstrap and local flows without `DATABASE_URL`.
- `api` switches to `prisma` mode when `DATABASE_URL` is configured and `@prisma/client` is installed.
- `GET /api/health` exposes runtime diagnostics so deployment checks can verify the actual mode instead of assuming DB-backed startup.

### Observability

- structured logs
- Sentry for exception capture
- OpenTelemetry for traces
- Prometheus/Grafana for metrics

## UI Product Split

### CRM Web

- dashboard
- drivers
- vehicles
- contracts
- payments
- payouts
- reports
- settings
- users / roles
- audit

### Driver App

- profile
- debt summary
- payment schedule
- payout request
- yandex balance
- statuses / requests
- notifications

### Manager App

- team dashboard
- driver list
- debt alerts
- status changes
- incidents
- quick actions
