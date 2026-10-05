#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gopark-3da8f}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-gopark-api}"
IMAGE_NAME="${IMAGE_NAME:-gopark-api}"
IMAGE_URI="gcr.io/${PROJECT_ID}/${IMAGE_NAME}:latest"
DEPLOY_ENV="${DEPLOY_ENV:-staging}"
APP_RUNTIME="${APP_RUNTIME:-api}"
HTTP_REQUEST_LOGGING="${HTTP_REQUEST_LOGGING:-true}"
ALLOW_INSECURE_BOOTSTRAP_AUTH="${ALLOW_INSECURE_BOOTSTRAP_AUTH:-false}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-true}"
SKIP_BUILD="${SKIP_BUILD:-false}"
AUTH_TOKEN_SECRET="${AUTH_TOKEN_SECRET:-}"
DATABASE_URL="${DATABASE_URL:-}"
REDIS_URL="${REDIS_URL:-}"
AUTH_TOKEN_SECRET_NAME="${AUTH_TOKEN_SECRET_NAME:-}"
DATABASE_URL_SECRET_NAME="${DATABASE_URL_SECRET_NAME:-}"
REDIS_URL_SECRET_NAME="${REDIS_URL_SECRET_NAME:-}"
CLOUDSQL_INSTANCE="${CLOUDSQL_INSTANCE:-}"
VPC_CONNECTOR="${VPC_CONNECTOR:-}"
VPC_EGRESS="${VPC_EGRESS:-private-ranges-only}"
MIN_INSTANCES="${MIN_INSTANCES:-}"
MAX_INSTANCES="${MAX_INSTANCES:-}"
MEMORY="${MEMORY:-}"
CPU="${CPU:-}"
NO_CPU_THROTTLING="${NO_CPU_THROTTLING:-false}"
AUTH_LOGIN_RATE_LIMIT_ATTEMPTS="${AUTH_LOGIN_RATE_LIMIT_ATTEMPTS:-}"
AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS="${AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS:-}"
AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS="${AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS:-}"
AUTH_REFRESH_RATE_LIMIT_ATTEMPTS="${AUTH_REFRESH_RATE_LIMIT_ATTEMPTS:-}"
AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS="${AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS:-}"
AUTH_REFRESH_RATE_LIMIT_BLOCK_SECONDS="${AUTH_REFRESH_RATE_LIMIT_BLOCK_SECONDS:-}"
AUTH_LOGOUT_RATE_LIMIT_ATTEMPTS="${AUTH_LOGOUT_RATE_LIMIT_ATTEMPTS:-}"
AUTH_LOGOUT_RATE_LIMIT_WINDOW_SECONDS="${AUTH_LOGOUT_RATE_LIMIT_WINDOW_SECONDS:-}"
AUTH_LOGOUT_RATE_LIMIT_BLOCK_SECONDS="${AUTH_LOGOUT_RATE_LIMIT_BLOCK_SECONDS:-}"

if [[ -n "${DATABASE_URL}" ]]; then
  echo "[deploy_api_cloud_run] Prisma runtime requested via DATABASE_URL"
fi

if [[ -n "${DATABASE_URL_SECRET_NAME}" ]]; then
  echo "[deploy_api_cloud_run] Prisma runtime requested via Secret Manager DATABASE_URL=${DATABASE_URL_SECRET_NAME}"
fi

if [[ -n "${REDIS_URL}" ]]; then
  echo "[deploy_api_cloud_run] BullMQ runtime requested via REDIS_URL"
fi

if [[ -n "${REDIS_URL_SECRET_NAME}" ]]; then
  echo "[deploy_api_cloud_run] BullMQ runtime requested via Secret Manager REDIS_URL=${REDIS_URL_SECRET_NAME}"
fi

if [[ "${DEPLOY_ENV}" == "production" ]]; then
  if [[ -z "${AUTH_TOKEN_SECRET}" && -z "${AUTH_TOKEN_SECRET_NAME}" ]]; then
    echo "[deploy_api_cloud_run] AUTH_TOKEN_SECRET or AUTH_TOKEN_SECRET_NAME is required for production deploys" >&2
    exit 1
  fi

  if [[ -z "${DATABASE_URL}" && -z "${DATABASE_URL_SECRET_NAME}" ]]; then
    echo "[deploy_api_cloud_run] DATABASE_URL or DATABASE_URL_SECRET_NAME is required for production deploys" >&2
    exit 1
  fi

  if [[ "${ALLOW_INSECURE_BOOTSTRAP_AUTH}" != "false" ]]; then
    echo "[deploy_api_cloud_run] Production deploys must set ALLOW_INSECURE_BOOTSTRAP_AUTH=false" >&2
    exit 1
  fi

  if [[ "${APP_RUNTIME}" == "worker" && -z "${REDIS_URL}" && -z "${REDIS_URL_SECRET_NAME}" ]]; then
    echo "[deploy_api_cloud_run] Worker production deploys require REDIS_URL or REDIS_URL_SECRET_NAME" >&2
    exit 1
  fi
fi

env_vars=(
  "NODE_ENV=${DEPLOY_ENV}"
  "APP_RUNTIME=${APP_RUNTIME}"
  "API_PREFIX=api"
  "HTTP_REQUEST_LOGGING=${HTTP_REQUEST_LOGGING}"
  "ALLOW_INSECURE_BOOTSTRAP_AUTH=${ALLOW_INSECURE_BOOTSTRAP_AUTH}"
)
secret_vars=()

if [[ -n "${AUTH_TOKEN_SECRET}" ]]; then
  env_vars+=("AUTH_TOKEN_SECRET=${AUTH_TOKEN_SECRET}")
fi

if [[ -n "${AUTH_TOKEN_SECRET_NAME}" ]]; then
  secret_vars+=("AUTH_TOKEN_SECRET=${AUTH_TOKEN_SECRET_NAME}:latest")
fi

if [[ -n "${DATABASE_URL}" ]]; then
  env_vars+=("DATABASE_URL=${DATABASE_URL}")
fi

if [[ -n "${DATABASE_URL_SECRET_NAME}" ]]; then
  secret_vars+=("DATABASE_URL=${DATABASE_URL_SECRET_NAME}:latest")
fi

if [[ -n "${REDIS_URL}" ]]; then
  env_vars+=("REDIS_URL=${REDIS_URL}")
fi

if [[ -n "${REDIS_URL_SECRET_NAME}" ]]; then
  secret_vars+=("REDIS_URL=${REDIS_URL_SECRET_NAME}:latest")
fi

if [[ -n "${AUTH_LOGIN_RATE_LIMIT_ATTEMPTS}" ]]; then
  env_vars+=("AUTH_LOGIN_RATE_LIMIT_ATTEMPTS=${AUTH_LOGIN_RATE_LIMIT_ATTEMPTS}")
fi

if [[ -n "${AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS}" ]]; then
  env_vars+=("AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS=${AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS}")
fi

if [[ -n "${AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS}" ]]; then
  env_vars+=("AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS=${AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS}")
fi

if [[ -n "${AUTH_REFRESH_RATE_LIMIT_ATTEMPTS}" ]]; then
  env_vars+=("AUTH_REFRESH_RATE_LIMIT_ATTEMPTS=${AUTH_REFRESH_RATE_LIMIT_ATTEMPTS}")
fi

if [[ -n "${AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS}" ]]; then
  env_vars+=("AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS=${AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS}")
fi

if [[ -n "${AUTH_REFRESH_RATE_LIMIT_BLOCK_SECONDS}" ]]; then
  env_vars+=("AUTH_REFRESH_RATE_LIMIT_BLOCK_SECONDS=${AUTH_REFRESH_RATE_LIMIT_BLOCK_SECONDS}")
fi

if [[ -n "${AUTH_LOGOUT_RATE_LIMIT_ATTEMPTS}" ]]; then
  env_vars+=("AUTH_LOGOUT_RATE_LIMIT_ATTEMPTS=${AUTH_LOGOUT_RATE_LIMIT_ATTEMPTS}")
fi

if [[ -n "${AUTH_LOGOUT_RATE_LIMIT_WINDOW_SECONDS}" ]]; then
  env_vars+=("AUTH_LOGOUT_RATE_LIMIT_WINDOW_SECONDS=${AUTH_LOGOUT_RATE_LIMIT_WINDOW_SECONDS}")
fi

if [[ -n "${AUTH_LOGOUT_RATE_LIMIT_BLOCK_SECONDS}" ]]; then
  env_vars+=("AUTH_LOGOUT_RATE_LIMIT_BLOCK_SECONDS=${AUTH_LOGOUT_RATE_LIMIT_BLOCK_SECONDS}")
fi

cloudsql_flags=()
network_flags=()
scaling_flags=()
runtime_flags=()

if [[ -n "${CLOUDSQL_INSTANCE}" ]]; then
  cloudsql_flags+=(--add-cloudsql-instances "${CLOUDSQL_INSTANCE}")
fi

if [[ -n "${VPC_CONNECTOR}" ]]; then
  network_flags+=(--vpc-connector "${VPC_CONNECTOR}" --vpc-egress "${VPC_EGRESS}")
fi

if [[ -n "${MIN_INSTANCES}" ]]; then
  scaling_flags+=(--min-instances "${MIN_INSTANCES}")
fi

if [[ -n "${MAX_INSTANCES}" ]]; then
  scaling_flags+=(--max-instances "${MAX_INSTANCES}")
fi

if [[ -n "${MEMORY}" ]]; then
  runtime_flags+=(--memory "${MEMORY}")
fi

if [[ -n "${CPU}" ]]; then
  runtime_flags+=(--cpu "${CPU}")
fi

if [[ "${NO_CPU_THROTTLING}" == "true" ]]; then
  runtime_flags+=(--no-cpu-throttling)
fi

if [[ "${SKIP_BUILD}" != "true" ]]; then
  echo "[deploy_api_cloud_run] Building ${IMAGE_URI} via Cloud Build"
  gcloud builds submit \
    --config apps/api/cloudbuild.run.yaml \
    --project "${PROJECT_ID}" \
    .
else
  echo "[deploy_api_cloud_run] Skipping Cloud Build; reusing ${IMAGE_URI}"
fi

echo "[deploy_api_cloud_run] Deploying ${SERVICE_NAME} to Cloud Run in ${REGION}"
deploy_args=(
  run deploy "${SERVICE_NAME}"
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --platform managed
  --image "${IMAGE_URI}"
)

if [[ "${ALLOW_UNAUTHENTICATED}" == "true" ]]; then
  deploy_args+=(--allow-unauthenticated)
else
  deploy_args+=(--no-allow-unauthenticated)
fi

if [[ ${#cloudsql_flags[@]} -gt 0 ]]; then
  deploy_args+=("${cloudsql_flags[@]}")
fi

if [[ ${#network_flags[@]} -gt 0 ]]; then
  deploy_args+=("${network_flags[@]}")
fi

if [[ ${#scaling_flags[@]} -gt 0 ]]; then
  deploy_args+=("${scaling_flags[@]}")
fi

if [[ ${#runtime_flags[@]} -gt 0 ]]; then
  deploy_args+=("${runtime_flags[@]}")
fi

if [[ ${#env_vars[@]} -gt 0 ]]; then
  deploy_args+=(--set-env-vars "$(IFS=,; echo "${env_vars[*]}")")
fi

if [[ ${#secret_vars[@]} -gt 0 ]]; then
  deploy_args+=(--set-secrets "$(IFS=,; echo "${secret_vars[*]}")")
fi

gcloud "${deploy_args[@]}"

echo "[deploy_api_cloud_run] Done"
