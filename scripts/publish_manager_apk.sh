#!/usr/bin/env bash
set -euo pipefail
: "${CODE_SHA:?}" "${APK_SHA256:?}" "${ZIP_SHA256:?}" "${STAGE:?}"
[[ "$CODE_SHA" =~ ^[0-9a-f]{40}$ ]]
[[ "$APK_SHA256" =~ ^[0-9a-f]{64}$ ]]
[[ "$ZIP_SHA256" =~ ^[0-9a-f]{64}$ ]]
BASE=${GOPARK_DEPLOY_BASE:-/home/client}
exec 9>/tmp/gopark-production-deploy.lock
flock -n 9 || { echo 'Another deploy is running'; exit 1; }
test "$(cat "$BASE/gopark-current-sha")" = "$CODE_SHA"
CURRENT=$(readlink -f "$BASE/gopark-current")
test -d "$CURRENT"
curl --max-time 15 -fsS http://127.0.0.1:3000/api/health > /dev/null
cd "$STAGE"
printf '%s  gopark-manager.apk\n%s  gopark-manager.zip\n' "$APK_SHA256" "$ZIP_SHA256" | sha256sum --check
test -s manager-download.html
BACKUP="$BASE/backups/manager-apk-$CODE_SHA-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP/release" "$BACKUP/runtime"
chmod 700 "$BACKUP"
files=(gopark-manager.apk gopark-manager.zip manager-download.html)
# Back up both persistent release files and the actually served container files.
for file in "${files[@]}"; do
  if [ -f "$CURRENT/$file" ]; then cp -p "$CURRENT/$file" "$BACKUP/release/$file"; fi
  docker cp "gopark-crm-web:/usr/share/nginx/html/$file" "$BACKUP/runtime/$file"
done
rollback() {
  result=$?
  trap - ERR
  echo 'Restoring previous APK download files.'
  for file in "${files[@]}"; do
    if [ -f "$BACKUP/release/$file" ]; then cp -p "$BACKUP/release/$file" "$CURRENT/$file"; else rm -f "$CURRENT/$file"; fi
    docker cp "$BACKUP/runtime/$file" "gopark-crm-web:/usr/share/nginx/html/$file"
  done
  exit "$result"
}
trap rollback ERR
for file in "${files[@]}"; do
  chmod 644 "$STAGE/$file"
  cp "$STAGE/$file" "$CURRENT/.$file.new"
  docker cp "$STAGE/$file" "gopark-crm-web:/usr/share/nginx/html/.$file.new"
done
for file in "${files[@]}"; do
  mv "$CURRENT/.$file.new" "$CURRENT/$file"
  docker exec gopark-crm-web mv "/usr/share/nginx/html/.$file.new" "/usr/share/nginx/html/$file"
done
actual=$(docker exec gopark-crm-web sha256sum /usr/share/nginx/html/gopark-manager.apk)
test "${actual%% *}" = "$APK_SHA256"
actual=$(docker exec gopark-crm-web sha256sum /usr/share/nginx/html/gopark-manager.zip)
test "${actual%% *}" = "$ZIP_SHA256"
curl --max-time 15 -fsSI http://127.0.0.1:3000/gopark-manager.apk | tr -d '\r' | grep -qi '^Content-Disposition: attachment;'
curl --max-time 15 -fsSI http://127.0.0.1:3000/gopark-manager.zip | tr -d '\r' | grep -qi '^Content-Disposition: attachment;'
curl --max-time 15 -fsS http://127.0.0.1:3000/manager-download.html | grep -q "$APK_SHA256"
curl --max-time 15 -fsS http://127.0.0.1:3000/api/health
trap - ERR
printf '\nPublished APK %s; backup: %s\n' "$APK_SHA256" "$BACKUP"
