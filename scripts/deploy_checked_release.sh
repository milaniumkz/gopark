#!/usr/bin/env bash
set -euo pipefail
: "${SHA:?Release SHA required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]]
BASE=${GOPARK_DEPLOY_BASE:-/home/client}
CONFIG_DIR="$BASE/gopark"
RELEASE_DIR="$BASE/gopark-releases/$SHA"
ARCHIVE="/tmp/gopark-release-$SHA.tgz"
BACKUP_DIR="$BASE/backups/gopark-$SHA-$(date -u +%Y%m%dT%H%M%SZ)"
exec 9>/tmp/gopark-production-deploy.lock
flock -n 9 || { echo 'Another deploy is running'; exit 1; }
if [ -L "$BASE/gopark-current" ]; then
  PREVIOUS_DIR=$(readlink -f "$BASE/gopark-current")
else
  PREVIOUS_DIR="$CONFIG_DIR"
fi
# Confirm the existing services are healthy before touching anything.
curl --retry 2 --retry-delay 2 -fsS http://127.0.0.1:3000/api/health > /tmp/gopark-predeploy-health.json
test -s "$ARCHIVE"
test -f "$CONFIG_DIR/.env"
test -d "$CONFIG_DIR/secrets"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
docker exec gopark-postgres pg_dump -U gopark gopark | gzip > "$BACKUP_DIR/database.sql.gz"
gzip -t "$BACKUP_DIR/database.sql.gz"
test -s "$BACKUP_DIR/database.sql.gz"
tar -czf "$BACKUP_DIR/configuration.tgz" -C "$CONFIG_DIR" .env secrets
tar -tzf "$BACKUP_DIR/configuration.tgz" > /dev/null
if [ -f "$BASE/gopark-current-sha" ]; then cp "$BASE/gopark-current-sha" "$BACKUP_DIR/previous-sha"; fi
printf '%s\n' "$PREVIOUS_DIR" > "$BACKUP_DIR/previous-directory"
# Keep the actual running image versions for rollback, without replacing their tags.
for service in api worker crm-web; do
  docker inspect --format '{{.Image}}' "gopark-$service" > "$BACKUP_DIR/$service-image"
done
API_PREVIOUS=$(cat "$BACKUP_DIR/api-image")
WORKER_PREVIOUS=$(cat "$BACKUP_DIR/worker-image")
CRM_PREVIOUS=$(cat "$BACKUP_DIR/crm-web-image")
printf 'services:\n  api:\n    image: %s\n  worker:\n    image: %s\n  crm-web:\n    image: %s\n' "$API_PREVIOUS" "$WORKER_PREVIOUS" "$CRM_PREVIOUS" > "$BACKUP_DIR/rollback.yml"
echo "Verified backup: $BACKUP_DIR"
# An existing checkout/release is never removed or overwritten.
if [ -e "$RELEASE_DIR" ]; then echo 'Release directory already exists; refusing overwrite'; exit 1; fi
mkdir -p "$RELEASE_DIR"
tar -xzf "$ARCHIVE" -C "$RELEASE_DIR"
for artifact in apps/driver-app/build/web apps/manager-app/build/web apk gopark-manager.apk gopark-driver.apk; do
  if [ -e "$PREVIOUS_DIR/$artifact" ]; then
    mkdir -p "$RELEASE_DIR/$(dirname "$artifact")"
    cp -a "$PREVIOUS_DIR/$artifact" "$RELEASE_DIR/$artifact"
  elif [ -e "$CONFIG_DIR/$artifact" ]; then
    mkdir -p "$RELEASE_DIR/$(dirname "$artifact")"
    cp -a "$CONFIG_DIR/$artifact" "$RELEASE_DIR/$artifact"
  fi
done
printf 'services:\n  api:\n    image: gopark-api:%s\n  worker:\n    image: gopark-api:%s\n  api-migrate:\n    image: gopark-api:%s\n  crm-web:\n    image: gopark-crm-web:%s\n' "$SHA" "$SHA" "$SHA" "$SHA" > "$RELEASE_DIR/release-images.yml"
cd "$RELEASE_DIR"
compose=(docker compose -p gopark --env-file "$CONFIG_DIR/.env" -f docker-compose.server.yml -f release-images.yml)
"${compose[@]}" build api crm-web
# Apply migrations only. Never re-seed an existing production database.
"${compose[@]}" run --rm --no-deps --interactive=false -T api-migrate node /app/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma < /dev/null
rollback() {
  result=$?
  trap - ERR
  echo 'Application update failed; restoring previous application images.'
  cd "$PREVIOUS_DIR"
  docker compose -p gopark --env-file "$CONFIG_DIR/.env" -f docker-compose.server.yml -f "$BACKUP_DIR/rollback.yml" up -d --no-deps --force-recreate api worker crm-web
  for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3000/api/health; then break; fi
    sleep 2
  done
  exit "$result"
}
trap rollback ERR
"${compose[@]}" up -d --no-deps --force-recreate api worker crm-web
healthy=false
for attempt in $(seq 1 45); do
  if curl -fsS http://127.0.0.1:3000/api/health > "$BACKUP_DIR/after-health.json"; then
    if docker exec -i gopark-api node -e 'const h=JSON.parse(require("fs").readFileSync(0,"utf8"));if(h.status!=="ok"||h.mode!=="prisma"||!h.redisQueueReady||!h.productionStartupSafe)process.exit(1)' < "$BACKUP_DIR/after-health.json"; then
      healthy=true
      break
    fi
  fi
  sleep 2
done
[ "$healthy" = true ]
[ "$(docker inspect --format '{{.Config.Image}}' gopark-api)" = "gopark-api:$SHA" ]
[ "$(docker inspect --format '{{.State.Running}}' gopark-worker)" = true ]
# Exercise the generated Prisma client and history column without exposing customer data.
docker exec gopark-api node -e 'const {PrismaClient}=require("./apps/api/node_modules/@prisma/client");const p=new PrismaClient();p.incident.findFirst({select:{statusHistory:true}}).then(()=>console.log("Incident history database read OK")).catch(()=>{console.error("Incident history database read failed");process.exitCode=1}).finally(()=>p.$disconnect())'
curl -fsS http://127.0.0.1:3000/ > /dev/null
# Commit the active-release pointer only after all checks pass.
ln -sfn "$RELEASE_DIR" "$BASE/gopark-current"
printf '%s\n' "$SHA" > "$BASE/gopark-current-sha"
trap - ERR
cat "$BACKUP_DIR/after-health.json"
printf '\nDeployed checked release %s\n' "$SHA"
