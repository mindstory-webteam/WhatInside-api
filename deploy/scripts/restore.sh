#!/usr/bin/env sh
# Restore a backup created by backup.sh. THIS REPLACES THE CURRENT DATABASE CONTENTS.
# Usage: deploy/scripts/restore.sh deploy/backups/whatinside-YYYYMMDD-HHMMSS.dump [compose-file]
set -eu
FILE="${1:?path to .dump file}"
COMPOSE_FILE="${2:-docker-compose.prod.yml}"
NAME="$(basename "$FILE")"
printf "Restore %s over the live database? Type 'restore' to continue: " "$NAME"
read -r answer
[ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }
docker compose -f "$COMPOSE_FILE" --env-file deploy/.env.prod stop api worker beat
docker compose -f "$COMPOSE_FILE" --env-file deploy/.env.prod exec -T db \
  sh -c "pg_restore -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --clean --if-exists --no-owner /backups/$NAME"
docker compose -f "$COMPOSE_FILE" --env-file deploy/.env.prod start api worker beat
echo "Restored $NAME"
