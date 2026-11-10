#!/bin/sh
set -eu

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=app_password="$APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE kume_app LOGIN PASSWORD %L', :'app_password') \gexec
GRANT CONNECT ON DATABASE kume TO kume_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO kume_app;
GRANT USAGE, CREATE ON SCHEMA public TO kume_app;
SQL
