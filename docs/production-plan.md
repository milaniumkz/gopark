# Production Plan

This document is the current production transition plan for GoPark.

## P0 Must-Have Before Production

- [x] Modular backend, shared contracts, Prisma schema, and SQL migrations
- [x] Offline readiness gate for backend/mobile/CRM surface drift
- [x] Fail-fast runtime guardrails for unsafe production startup
- [x] Basic HTTP request tracing with `x-request-id`
- [x] Replace bootstrap header auth with bearer access tokens
- [x] Add refresh token rotation and session revocation
- [x] Install real dependencies and run API `typecheck` / `test`
- [x] Install CRM dependencies and run web `typecheck` / `build`
- [ ] Run Flutter analyze/build for production targets
- [x] Bring up PostgreSQL-backed Prisma runtime and apply migrations
- [x] Bootstrap production-like data and verify live repository paths
- [x] Move Cloud Run secrets to Secret Manager-backed injection

## P1 High Priority After Production Bootstrap

- [x] Wire Redis/BullMQ for async workers and retries
- [ ] Add production error tracking and metrics shipping
- [x] Add rate limiting for auth and sensitive endpoints
- [ ] Enforce stricter request DTO validation
- [ ] Finish secure auth hardening for owner/admin/finance roles
- [ ] Validate Bakai/Yandex integrations on real staging data

## P2 Stabilization

- [ ] MFA for sensitive roles
- [ ] Session persistence on mobile clients
- [ ] Broader workflow/integration test coverage
- [ ] Backup/restore and rollback rehearsal
- [ ] Production incident playbooks and alert thresholds

## Current Local Reality

- `verify:offline` passes
- `verify:production-readiness` can pass in production-like env when Prisma, secrets, bearer auth, refresh hardening, and auth rate limiting are all wired
- current public runtime uses bearer auth, Prisma-backed PostgreSQL, Secret Manager-backed secrets, server-side auth rate limiting, and dedicated Redis/BullMQ-backed outbox worker runtime
- current next hardening step is observability + stricter DTO validation
