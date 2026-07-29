#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIRECTORY="$(cd "${SCRIPT_DIRECTORY}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_DIRECTORY}/infra/docker-compose.yml"
BACKUP_DIRECTORY="${PROJECT_DIRECTORY}/.local-backups"
SOURCE_DATABASE="dontworry"
DATABASE_USER="dontworry"
RESTORE_DATABASE="dontworry_restore_verify_$(date +%s)"
DUMP_PATH="${BACKUP_DIRECTORY}/${SOURCE_DATABASE}-$(date -u +%Y%m%dT%H%M%SZ).dump"

if [[ ! "${RESTORE_DATABASE}" =~ ^dontworry_restore_verify_[0-9]+$ ]]; then
  echo "Refusing to use an unexpected restore database name." >&2
  exit 1
fi

cleanup() {
  docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    dropdb --if-exists --force --username "${DATABASE_USER}" "${RESTORE_DATABASE}" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

mkdir -p "${BACKUP_DIRECTORY}"
docker compose -f "${COMPOSE_FILE}" ps --status running postgres >/dev/null

docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump --username "${DATABASE_USER}" --dbname "${SOURCE_DATABASE}" \
  --format custom --no-owner --no-acl >"${DUMP_PATH}"

docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  createdb --username "${DATABASE_USER}" "${RESTORE_DATABASE}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  pg_restore --username "${DATABASE_USER}" --dbname "${RESTORE_DATABASE}" \
  --exit-on-error --no-owner --no-acl <"${DUMP_PATH}"

query_scalar() {
  local database_name="$1"
  local sql="$2"
  docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    psql --username "${DATABASE_USER}" --dbname "${database_name}" \
    --tuples-only --no-align --command "${sql}" | tr -d '[:space:]'
}

SOURCE_TABLES="$(query_scalar "${SOURCE_DATABASE}" \
  "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"
RESTORED_TABLES="$(query_scalar "${RESTORE_DATABASE}" \
  "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"
SOURCE_MIGRATIONS="$(query_scalar "${SOURCE_DATABASE}" \
  'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;')"
RESTORED_MIGRATIONS="$(query_scalar "${RESTORE_DATABASE}" \
  'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;')"
SOURCE_CORE_ROWS="$(query_scalar "${SOURCE_DATABASE}" \
  'SELECT (SELECT count(*) FROM guardian_accounts) + (SELECT count(*) FROM subject_profiles) + (SELECT count(*) FROM risk_events) + (SELECT count(*) FROM incidents) + (SELECT count(*) FROM notification_outbox);')"
RESTORED_CORE_ROWS="$(query_scalar "${RESTORE_DATABASE}" \
  'SELECT (SELECT count(*) FROM guardian_accounts) + (SELECT count(*) FROM subject_profiles) + (SELECT count(*) FROM risk_events) + (SELECT count(*) FROM incidents) + (SELECT count(*) FROM notification_outbox);')"

if [[ "${SOURCE_TABLES}" != "${RESTORED_TABLES}" ||
      "${SOURCE_MIGRATIONS}" != "${RESTORED_MIGRATIONS}" ||
      "${SOURCE_CORE_ROWS}" != "${RESTORED_CORE_ROWS}" ]]; then
  echo "Restore verification failed: source and restored database counts differ." >&2
  exit 1
fi

DUMP_SHA256="$(shasum -a 256 "${DUMP_PATH}" | awk '{print $1}')"
echo "PostgreSQL restore verification passed."
echo "Backup: ${DUMP_PATH}"
echo "SHA-256: ${DUMP_SHA256}"
echo "Tables: ${RESTORED_TABLES}, migrations: ${RESTORED_MIGRATIONS}, core rows: ${RESTORED_CORE_ROWS}"
