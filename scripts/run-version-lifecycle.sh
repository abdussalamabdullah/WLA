#!/bin/zsh
# Execute the seeded-mission version lifecycle regression (D-111) against a
# throwaway local cluster built by scripts/local-db.sh — real migrations, then
# the real seeds in config order, with no manual backfill and no disabled
# trigger. Never touches the Supabase stack.
set -e
PORT=${PORT:-55463}
R=$(cd "$(dirname "$0")/.." && pwd)
P=/opt/homebrew/bin/psql
MIG="$R/supabase/migrations/20261010120000_seeded_mission_version_lifecycle.sql"

"$R/scripts/local-db.sh" "$PORT" --with-fixtures >/dev/null

OUT=$($P -h 127.0.0.1 -p $PORT -U postgres -f "$R/scripts/version-lifecycle-regression.sql" 2>&1)
echo "$OUT" | grep -E "(PASS|FAIL|========|ERROR:)" | sed -E "s/^.*NOTICE: +//"

# D. An EXISTING environment: apply the migration again to a database whose
# missions already have a lifecycle (what staging is). It must succeed, report
# 0 missions initialised and change nothing.
digest() { $P -h 127.0.0.1 -p $PORT -U postgres -X -A -t -c "select lifecycle_digest()"; }
BEFORE=$(digest)
REAPPLY=$($P -h 127.0.0.1 -p $PORT -U postgres -X -A -t -v ON_ERROR_STOP=1 -f "$MIG" 2>&1) && RC=0 || RC=$?
AFTER=$(digest)
echo "======================== D. Re-applying the migration (existing environment)"
D=""
[ $RC -eq 0 ] && D+="PASS  D1 the migration re-applies without error"$'\n' || D+="FAIL  D1 the migration re-applies without error (exit $RC)"$'\n'
echo "$REAPPLY" | grep -qx "0" && D+="PASS  D2 it reports 0 missions initialised"$'\n' || D+="FAIL  D2 it reports 0 missions initialised"$'\n'
[ "$BEFORE" = "$AFTER" ] && D+="PASS  D3 no version, Kit or note row changed" || D+="FAIL  D3 no version, Kit or note row changed"
echo "$D"

PASS=$(( $(echo "$OUT" | grep -c "NOTICE: *PASS" || true) + $(echo "$D" | grep -c "^PASS" || true) ))
FAIL=$(( $(echo "$OUT" | grep -c "NOTICE: *FAIL" || true) + $(echo "$D" | grep -c "^FAIL" || true) ))
# An erroring statement silently drops the check it fed: count it as a failure.
FAIL=$((FAIL + $(echo "$OUT" | grep -c "ERROR:" || true)))
echo ""
echo "PASS: $PASS   FAIL: $FAIL"
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D "${WLA_PGDIR:-/tmp/wla-lms/pg}/$PORT" stop >/dev/null 2>&1 || true
[ "$FAIL" -eq 0 ]
