#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gopark-3da8f}"
REGION="${REGION:-us-central1}"
NETWORK="${NETWORK:-default}"
VPC_CONNECTOR="${VPC_CONNECTOR:-gopark-serverless-vpc}"
VPC_CONNECTOR_RANGE="${VPC_CONNECTOR_RANGE:-10.8.0.0/28}"
VPC_CONNECTOR_MIN_INSTANCES="${VPC_CONNECTOR_MIN_INSTANCES:-2}"
VPC_CONNECTOR_MAX_INSTANCES="${VPC_CONNECTOR_MAX_INSTANCES:-3}"
VPC_CONNECTOR_MACHINE_TYPE="${VPC_CONNECTOR_MACHINE_TYPE:-e2-micro}"
REDIS_INSTANCE="${REDIS_INSTANCE:-gopark-redis}"
REDIS_TIER="${REDIS_TIER:-BASIC}"
REDIS_SIZE_GB="${REDIS_SIZE_GB:-1}"
REDIS_VERSION="${REDIS_VERSION:-redis_7_2}"
REDIS_RESERVED_IP_RANGE="${REDIS_RESERVED_IP_RANGE:-10.10.0.0/29}"
REDIS_SECRET_NAME="${REDIS_SECRET_NAME:-gopark-redis-url}"

echo "[provision_outbox_worker_runtime] enabling required APIs"
gcloud services enable redis.googleapis.com vpcaccess.googleapis.com --project "${PROJECT_ID}"

echo "[provision_outbox_worker_runtime] ensuring VPC connector ${VPC_CONNECTOR}"
if ! gcloud compute networks vpc-access connectors describe "${VPC_CONNECTOR}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" >/dev/null 2>&1; then
  gcloud compute networks vpc-access connectors create "${VPC_CONNECTOR}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --network "${NETWORK}" \
    --range "${VPC_CONNECTOR_RANGE}" \
    --min-instances "${VPC_CONNECTOR_MIN_INSTANCES}" \
    --max-instances "${VPC_CONNECTOR_MAX_INSTANCES}" \
    --machine-type "${VPC_CONNECTOR_MACHINE_TYPE}"
fi

echo "[provision_outbox_worker_runtime] ensuring Memorystore instance ${REDIS_INSTANCE}"
if ! gcloud redis instances describe "${REDIS_INSTANCE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" >/dev/null 2>&1; then
  gcloud redis instances create "${REDIS_INSTANCE}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --network "${NETWORK}" \
    --tier "${REDIS_TIER}" \
    --size "${REDIS_SIZE_GB}" \
    --redis-version "${REDIS_VERSION}" \
    --connect-mode direct-peering \
    --reserved-ip-range "${REDIS_RESERVED_IP_RANGE}"
fi

REDIS_HOST="$(gcloud redis instances describe "${REDIS_INSTANCE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format='value(host)')"
REDIS_PORT="$(gcloud redis instances describe "${REDIS_INSTANCE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format='value(port)')"
REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}"

echo "[provision_outbox_worker_runtime] publishing ${REDIS_SECRET_NAME}"
if ! gcloud secrets describe "${REDIS_SECRET_NAME}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud secrets create "${REDIS_SECRET_NAME}" \
    --project "${PROJECT_ID}" \
    --replication-policy automatic
fi

printf '%s' "${REDIS_URL}" | gcloud secrets versions add "${REDIS_SECRET_NAME}" \
  --project "${PROJECT_ID}" \
  --data-file=-

echo "[provision_outbox_worker_runtime] ready"
echo "VPC_CONNECTOR=${VPC_CONNECTOR}"
echo "REDIS_INSTANCE=${REDIS_INSTANCE}"
echo "REDIS_URL=${REDIS_URL}"
echo "REDIS_URL_SECRET_NAME=${REDIS_SECRET_NAME}"
