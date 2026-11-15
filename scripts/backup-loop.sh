#!/bin/sh
set -eu

AWARDS_BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
AWARDS_BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p /backups
while true; do
  AWARDS_BACKUP_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  AWARDS_BACKUP_TMP="/backups/.awards-${AWARDS_BACKUP_TIMESTAMP}.dump.tmp"
  AWARDS_BACKUP_FILE="/backups/awards-${AWARDS_BACKUP_TIMESTAMP}.dump"
  if pg_dump --format=custom --file="$AWARDS_BACKUP_TMP"; then
    mv "$AWARDS_BACKUP_TMP" "$AWARDS_BACKUP_FILE"
    echo "backup_created=$AWARDS_BACKUP_FILE"
    find /backups -type f -name 'awards-*.dump' -mtime "+$AWARDS_BACKUP_RETENTION_DAYS" -delete
  else
    rm -f "$AWARDS_BACKUP_TMP"
    echo "backup_failed" >&2
  fi
  sleep "$AWARDS_BACKUP_INTERVAL_SECONDS"
done
