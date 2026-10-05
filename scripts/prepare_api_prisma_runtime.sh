#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[prepare_api_prisma_runtime] DATABASE_URL is required" >&2
  exit 1
fi

echo "[prepare_api_prisma_runtime] Generating Prisma client"
corepack pnpm --filter @gopark/api db:generate

echo "[prepare_api_prisma_runtime] Applying Prisma migrations"
corepack pnpm --filter @gopark/api db:migrate:deploy

echo "[prepare_api_prisma_runtime] Seeding runtime data"
corepack pnpm --filter @gopark/api db:seed

echo "[prepare_api_prisma_runtime] Done"
