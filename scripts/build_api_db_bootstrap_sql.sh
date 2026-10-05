#!/usr/bin/env bash
set -euo pipefail

OUTPUT_PATH="${1:-/tmp/gopark-api-bootstrap.sql}"
DB_NAME="${DB_NAME:-gopark}"
DB_USER="${DB_USER:-gopark_app}"

find apps/api/database/migrations -maxdepth 1 -type f -name '*.sql' | sort | xargs cat > "${OUTPUT_PATH}"

cat <<EOF >> "${OUTPUT_PATH}"

GRANT CONNECT ON DATABASE "${DB_NAME}" TO "${DB_USER}";
GRANT USAGE ON SCHEMA public TO "${DB_USER}";

DO \$\$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO "${DB_USER}"', obj.tablename);
  END LOOP;

  FOR obj IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.%I TO "${DB_USER}"', obj.sequencename);
  END LOOP;

  FOR obj IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
  LOOP
    EXECUTE format('GRANT USAGE ON TYPE public.%I TO "${DB_USER}"', obj.typname);
  END LOOP;
END
\$\$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "${DB_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${DB_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "${DB_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON TYPES TO "${DB_USER}";
EOF

echo "${OUTPUT_PATH}"
