# Deployment Notes

## Runtime Components

- `crm-web`
- `api`
- `postgres` for `prisma` runtime
- `redis` optional for current bootstrap runtime
- `s3-compatible storage`
- `reverse proxy`
- `monitoring stack`

## Production Requirements

- TLS termination at ingress
- private networking for API and database
- private networking for Redis when async/queue features are enabled
- secret injection through environment or vault
- database migrations before `prisma` rollout
- canary or blue-green deployment for API
- static asset caching for CRM

## Runtime Modes

- `api` can start in `in-memory` mode without `DATABASE_URL` and without Redis.
- `api` switches to `prisma` mode only when `DATABASE_URL` is configured and `@prisma/client` is installed.
- `api` now fails fast in `production` when bootstrap header auth is enabled.
- `api` also fails fast in `production` when it would otherwise start in `in-memory` mode, unless `ALLOW_IN_MEMORY_PRODUCTION=true` is explicitly set as a temporary override.
- `GET /api/health` reports the active mode and runtime readiness:
  - `mode`
  - `prismaEnabled`
  - `databaseUrlConfigured`
  - `prismaClientAvailable`
  - `redisConfigured`
  - `bootstrapAuthEnabled`
  - `inMemoryProductionAllowed`
  - `productionStartupSafe`

## Client Configuration

- CRM Web should receive `VITE_API_BASE_URL` if API is served on a separate origin.
- Flutter apps should be built with `--dart-define=API_BASE_URL=https://api.example.com/api`.
- Reverse proxy should forward client traffic to API under `/api` when same-origin deployment is used.

## Integration Toggles

- `settings.bakaiWebhookEnabled` controls whether `POST /api/integrations/bakai/webhooks` accepts inbound payloads.
- When disabled, the webhook returns `503 Service Unavailable` instead of silently accepting data.

## Rollout Order

1. Install backend dependencies and run runtime readiness checks.
   Also run `pnpm --filter @gopark/api verify:production-readiness` before any real production rollout.
2. If using `prisma` mode, apply database migrations and generate the Prisma client.
   Current bootstrap migration set includes manager mobile scope columns in `0003_manager_scope.sql`.
3. Deploy API.
4. Run smoke checks on `/api/health` and confirm the expected runtime `mode`.
5. Deploy CRM.
6. Verify auth, dashboard, drivers, vehicles.
