#!/bin/sh
# Backs up the local database, restores it into a scratch database, and
# compares row counts. Proves the backup can actually be restored.
set -eu

# Stops Git Bash on Windows rewriting /tmp into a Windows path.
export MSYS_NO_PATHCONV=1

compose="docker compose exec -T postgres"
dump=/tmp/tps-verify.dump
scratch=tps_restore_check
tables="subjects audit_logs"

$compose pg_dump -U postgres -Fc -f "$dump" tps
$compose psql -U postgres -q -c "DROP DATABASE IF EXISTS $scratch"
$compose psql -U postgres -q -c "CREATE DATABASE $scratch OWNER tps_owner"
$compose pg_restore -U postgres -d "$scratch" "$dump"

status=0
for table in $tables; do
  original=$($compose psql -U postgres -d tps -Atc "SELECT count(*) FROM $table")
  restored=$($compose psql -U postgres -d "$scratch" -Atc "SELECT count(*) FROM $table")
  echo "$table: original=$original restored=$restored"
  [ "$original" = "$restored" ] || status=1
done

$compose psql -U postgres -q -c "DROP DATABASE $scratch"

$compose rm -f "$dump"

if [ "$status" -eq 0 ]; then echo "Backup restore verified."; else echo "Backup restore FAILED."; fi
exit "$status"
