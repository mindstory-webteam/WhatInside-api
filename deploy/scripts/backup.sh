#!/usr/bin/env sh
# Create a compressed PostgreSQL backup in deploy/backups/ (inside the db container at /backups).
# Usage: deploy/scripts/backup.sh [compose-file]   (defaults to docker-compose.prod.yml)
set -eu
COMPOSE_FILE="${1:-docker-compose.prod.yml}"
STAMP="$(date +%Y%m%d-%H%M%S)"
docker compose -f "$COMPOSE_FILE" --env-file deploy/.env.prod exec -T db \
  sh -c "pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --format=custom --no-owner -f /backups/whatinside-$STAMP.dump"
echo "Backup written to deploy/backups/whatinside-$STAMP.dump"
# Keep the 14 most recent backups
ls -1t deploy/backups/whatinside-*.dump 2>/dev/null | tail -n +15 | xargs -r rm --
