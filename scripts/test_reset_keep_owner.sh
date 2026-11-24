#!/usr/bin/env bash
# Ephemeral local PostgreSQL only. Never accepts a production DATABASE_URL.
set -euo pipefail
SQL_FILE=$(realpath "${1:-scripts/reset_database_keep_owner.sql}")
TEST_CONTAINER="gopark-reset-test-${RANDOM}-$$"
cleanup() { docker rm -f -v "$TEST_CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Static test-only password; container has no published ports or application data.
docker run -d --name "$TEST_CONTAINER" --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_PASSWORD=isolated-reset-test postgres:16-alpine >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$TEST_CONTAINER" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$TEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE users (id text PRIMARY KEY, role text NOT NULL, status text NOT NULL, email text UNIQUE, password_hash text NOT NULL, mfa_enabled boolean DEFAULT false);
CREATE TABLE managers (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id text REFERENCES users(id));
CREATE TABLE cars (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, manager_id int REFERENCES managers(id));
CREATE TABLE incidents (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, car_id int REFERENCES cars(id));
CREATE TABLE payments (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, incident_id int REFERENCES incidents(id));
CREATE TABLE _prisma_migrations (id text PRIMARY KEY);
INSERT INTO users VALUES ('owner','owner','active','owner@test','keep-exactly',true),('admin','admin','active','admin@test','remove',false),('extra-owner','owner','active','extra@test','ambiguous',false);
INSERT INTO managers(user_id) VALUES ('admin');
INSERT INTO cars(manager_id) VALUES (1);
INSERT INTO incidents(car_id) VALUES (1);
INSERT INTO payments(incident_id) VALUES (1);
INSERT INTO _prisma_migrations VALUES ('keep-migration');
SQL
if docker exec -i "$TEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 < "$SQL_FILE" >/dev/null 2>&1; then
  echo 'Ambiguous-owner guard failed' >&2; exit 1
fi
# Guard failure must leave all business data intact.
docker exec "$TEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF (SELECT count(*) FROM payments)<>1 OR (SELECT count(*) FROM users)<>3 THEN RAISE EXCEPTION 'Guard did not roll back'; END IF; END \$\$; DELETE FROM users WHERE id='extra-owner';" >/dev/null
docker exec -i "$TEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 < "$SQL_FILE" >/dev/null
docker exec "$TEST_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF (SELECT count(*) FROM users)<>1 OR NOT EXISTS(SELECT 1 FROM users WHERE id='owner' AND password_hash='keep-exactly' AND mfa_enabled=true) OR (SELECT count(*) FROM payments)<>0 OR (SELECT count(*) FROM cars)<>0 OR (SELECT count(*) FROM _prisma_migrations)<>1 THEN RAISE EXCEPTION 'Reset verification failed'; END IF; END \$\$;" >/dev/null
echo 'PASS: ambiguous owners blocked with no data loss; unique owner credentials/MFA preserved; related data cleared; migrations preserved.'
