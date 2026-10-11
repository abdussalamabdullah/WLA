#!/bin/zsh
# Execute the Kit/parent-note release regression (D-114) against a throwaway
# local cluster built by scripts/local-db.sh — real migrations and seeds, real
# roles and claims, no disabled trigger. Never touches the Supabase stack.
set -e
PORT=${PORT:-55464}
R=$(cd "$(dirname "$0")/.." && pwd)
P=/opt/homebrew/bin/psql

"$R/scripts/local-db.sh" "$PORT" >/dev/null

OUT=$($P -h 127.0.0.1 -p $PORT -U postgres -f "$R/scripts/kit-release-regression.sql" 2>&1)
echo "$OUT" | grep -E "(PASS|FAIL|===============|ERROR:)" | sed -E "s/^.*NOTICE: +//"
PASS=$(echo "$OUT" | grep -c "NOTICE: *PASS" || true)
FAIL=$(echo "$OUT" | grep -c "NOTICE: *FAIL" || true)
# An erroring statement silently drops the check it fed: count it as a failure.
FAIL=$((FAIL + $(echo "$OUT" | grep -c "ERROR:" || true)))
echo ""
echo "PASS: $PASS   FAIL: $FAIL"
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D "${WLA_PGDIR:-/tmp/wla-lms/pg}/$PORT" stop >/dev/null 2>&1 || true
[ "$FAIL" -eq 0 ]
