#!/usr/bin/env bash
set -euo pipefail
umask 077
BASE=/home/client/gopark
TLS=/home/client/gopark-https
CERTS="$TLS/letsencrypt"
IP=185.138.185.36
exec 9>/tmp/gopark-production-deploy.lock
flock -n 9 || { echo 'Another production deploy is running'; exit 1; }
curl -fsS http://127.0.0.1:3000/api/health > /dev/null
if ! docker container inspect gopark-https > /dev/null 2>&1; then
  test -z "$(ss -H -ltn 'sport = :443')" || { echo 'Port 443 is already in use'; exit 1; }
fi
BACKUP="/home/client/backups/gopark-https-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP" "$TLS/packages" "$CERTS"
docker exec gopark-postgres pg_dump -U gopark gopark | gzip > "$BACKUP/database.sql.gz"
gzip -t "$BACKUP/database.sql.gz"
test -s "$BACKUP/database.sql.gz"
tar -czf "$BACKUP/configuration.tgz" -C "$BASE" .env secrets
tar -tzf "$BACKUP/configuration.tgz" > /dev/null
docker inspect gopark-crm-web > "$BACKUP/crm-container.json"
if [ -d "$TLS" ]; then tar -czf "$BACKUP/https.tgz" -C /home/client gopark-https; fi

# Install the official PyPI client without modifying the host Python installation.
PYTHON_VERSION=$(python3 -c 'import sys;print(f"{sys.version_info.major}.{sys.version_info.minor}")')
if ! PYTHONPATH="$TLS/packages" python3 "$TLS/packages/bin/certbot" --version > /dev/null 2>&1; then
  docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$TLS/packages:/packages" "python:$PYTHON_VERSION-slim-bookworm" \
    python -m pip install --no-cache-dir --target /packages 'certbot>=5.4,<7'
fi
PYTHONPATH="$TLS/packages" python3 "$TLS/packages/bin/certbot" --version

cat > "$TLS/auth.sh" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$CERTBOT_TOKEN" =~ ^[A-Za-z0-9_-]+$ ]]
temp=$(mktemp)
trap 'rm -f "$temp"' EXIT
printf '%s' "$CERTBOT_VALIDATION" > "$temp"
docker exec gopark-crm-web mkdir -p /usr/share/nginx/html/.well-known/acme-challenge
docker cp "$temp" "gopark-crm-web:/usr/share/nginx/html/.well-known/acme-challenge/$CERTBOT_TOKEN"
docker exec gopark-crm-web chmod 644 "/usr/share/nginx/html/.well-known/acme-challenge/$CERTBOT_TOKEN"
HOOK
cat > "$TLS/cleanup.sh" <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$CERTBOT_TOKEN" =~ ^[A-Za-z0-9_-]+$ ]]
docker exec gopark-crm-web rm -f "/usr/share/nginx/html/.well-known/acme-challenge/$CERTBOT_TOKEN"
HOOK
chmod 700 "$TLS/auth.sh" "$TLS/cleanup.sh"

PYTHONPATH="$TLS/packages" python3 "$TLS/packages/bin/certbot" certonly \
  --manual --preferred-challenges http \
  --manual-auth-hook "$TLS/auth.sh" --manual-cleanup-hook "$TLS/cleanup.sh" \
  --preferred-profile shortlived --ip-address "$IP" --cert-name gopark-ip \
  --config-dir "$CERTS" --work-dir "$TLS/work" --logs-dir "$TLS/logs" \
  --non-interactive --agree-tos --email milaniumkz@yandex.kz --keep-until-expiring

cat > "$TLS/nginx.conf" <<'NGINX'
server {
  listen 443 ssl;
  server_name 185.138.185.36;
  ssl_certificate /etc/letsencrypt/live/gopark-ip/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/gopark-ip/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  client_max_body_size 6m;
  location / {
    proxy_pass http://host.docker.internal:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
NGINX
chmod 644 "$TLS/nginx.conf"
if docker container inspect gopark-https > /dev/null 2>&1; then
  docker exec gopark-https nginx -t
  docker exec gopark-https nginx -s reload
else
  docker run -d --name gopark-https --restart unless-stopped \
    --add-host host.docker.internal:host-gateway -p 443:443 \
    -v "$CERTS:/etc/letsencrypt:ro" \
    -v "$TLS/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine
fi
curl --retry 5 --retry-delay 2 --retry-connrefused -fsS "https://$IP/api/health" > /dev/null
curl -fsS "https://$IP/privacy.html" > /dev/null
cat > "$TLS/renew.sh" <<'RENEW'
#!/usr/bin/env bash
set -euo pipefail
export PYTHONPATH=/home/client/gopark-https/packages
python3 /home/client/gopark-https/packages/bin/certbot renew --non-interactive \
  --config-dir /home/client/gopark-https/letsencrypt \
  --work-dir /home/client/gopark-https/work --logs-dir /home/client/gopark-https/logs \
  --deploy-hook 'docker exec gopark-https nginx -t && docker exec gopark-https nginx -s reload'
RENEW
chmod 700 "$TLS/renew.sh"
command -v crontab > /dev/null
{ crontab -l 2>/dev/null | sed '\|/home/client/gopark-https/renew.sh|d' || true; \
  echo '17 */6 * * * bash /home/client/gopark-https/renew.sh >> /home/client/gopark-https/renew.log 2>&1'; } | crontab -
PYTHONPATH="$TLS/packages" python3 "$TLS/packages/bin/certbot" renew --dry-run \
  --config-dir "$CERTS" --work-dir "$TLS/work" --logs-dir "$TLS/logs" \
  --run-deploy-hooks \
  --deploy-hook 'docker exec gopark-https nginx -t && docker exec gopark-https nginx -s reload'
echo 'HTTPS and renewal dry run verified. Automatic certificate renewal runs every six hours.'
