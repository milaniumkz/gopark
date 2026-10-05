#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gopark-3da8f}"

echo "[deploy_crm_firebase] Building CRM"
corepack pnpm --filter @gopark/crm-web build

echo "[deploy_crm_firebase] Deploying Firebase Hosting to ${PROJECT_ID}"
firebase deploy --only hosting --project "${PROJECT_ID}"

echo "[deploy_crm_firebase] Done"
