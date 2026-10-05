# Firebase / GCP Deploy

Current target project:

- `gopark-3da8f`

Current public endpoints:

- Web: `https://gopark-3da8f.web.app`
- API: `https://gopark-api-616719358036.us-central1.run.app`
- Worker: `https://gopark-outbox-worker-616719358036.us-central1.run.app`

## Deploy shape

- `apps/api` -> Cloud Run service `gopark-api` in `us-central1`
- `apps/api` -> Cloud Run service `gopark-outbox-worker` in `us-central1` when `APP_RUNTIME=worker`
- `apps/crm-web` -> Firebase Hosting site `gopark-3da8f`
- Hosting rewrites `api/**` to Cloud Run service `gopark-api`

## Current runtime status

- Hosting deploy is working
- Cloud Run deploy is working
- bearer auth is enabled in the current hosted API
- insecure bootstrap headers are disabled in the hosted API
- API uses Secret Manager-backed `DATABASE_URL`, `AUTH_TOKEN_SECRET`, and `REDIS_URL`
- outbox worker runs as a dedicated Cloud Run service with `min-instances=1`, `cpu-throttling=false`, and VPC connector `gopark-serverless-vpc`
- Redis runs in Memorystore instance `gopark-redis` with `maxmemory-policy=noeviction`

## Deploy commands

Deploy API:

```bash
bash scripts/deploy_api_cloud_run.sh
```

Key deploy env vars:

- `DEPLOY_ENV=staging|production`
- `AUTH_TOKEN_SECRET_NAME=gopark-auth-token-secret`
- `DATABASE_URL_SECRET_NAME=gopark-database-url`
- `REDIS_URL_SECRET_NAME=gopark-redis-url`
- `CLOUDSQL_INSTANCE=project:region:instance`
- `VPC_CONNECTOR=gopark-serverless-vpc` when private Redis access is required
- `ALLOW_INSECURE_BOOTSTRAP_AUTH=false`
- direct `AUTH_TOKEN_SECRET=...` and `DATABASE_URL=...` are acceptable only for temporary/manual staging use

Production deploy example:

```bash
DEPLOY_ENV=production \
AUTH_TOKEN_SECRET_NAME=gopark-auth-token-secret \
DATABASE_URL_SECRET_NAME=gopark-database-url \
REDIS_URL_SECRET_NAME=gopark-redis-url \
CLOUDSQL_INSTANCE=project:region:instance \
VPC_CONNECTOR=gopark-serverless-vpc \
bash scripts/deploy_api_cloud_run.sh
```

Provision worker runtime:

```bash
bash scripts/provision_outbox_worker_runtime.sh
```

Deploy worker:

```bash
bash scripts/deploy_outbox_worker_cloud_run.sh
```

Deploy CRM:

```bash
bash scripts/deploy_crm_firebase.sh
```

## Next production step

The remaining major rollout steps are:

1. add production error tracking and metrics shipping
2. tighten DTO validation on sensitive write paths
3. validate Bakai/Yandex integrations on real staging data
