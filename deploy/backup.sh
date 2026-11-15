#!/bin/sh
# Run on the VPS from any directory. Produces a coordinated DB + private-files backup.
set -eu
cd "$(dirname "$0")/.."
compose() { docker compose --env-file deploy/.env -f deploy/compose.yml "$@"; }
destination="backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$destination"
chmod 700 "$destination"
running=$(compose ps --status running --services)
restart() { case "$running" in *app*) compose start app ;; esac; }
trap restart EXIT HUP INT TERM
compose stop app
compose exec -T db pg_dump -U xeroo -d xeroo --format=custom > "$destination/database.dump"
compose run --rm --no-deps -T app tar -czf - -C /app/data . > "$destination/documents.tar.gz"
test -s "$destination/database.dump"
test -s "$destination/documents.tar.gz"
printf 'Completed %s UTC\nRestore-test before relying on this backup.\n' "$(date -u)" > "$destination/COMPLETE.txt"
printf 'Backup created: %s\nCopy it encrypted to a different machine.\n' "$destination"
