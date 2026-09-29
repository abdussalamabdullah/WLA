#!/bin/zsh
# Execute the Six Names branch regression against a throwaway local cluster.
# The database is built by scripts/local-db.sh, which applies the REAL
# migrations and seeds with pgcrypto in `extensions`, as hosted Supabase has it.
set -e
PORT=${PORT:-55462}
R=$(cd "$(dirname "$0")/.." && pwd)
P=/opt/homebrew/bin/psql

"$R/scripts/local-db.sh" "$PORT" --with-fixtures >/dev/null

OUT=$($P -h 127.0.0.1 -p $PORT -U postgres -f "$R/scripts/six-names-branches.sql" 2>&1)
echo "$OUT" | grep -E "(PASS|FAIL|===============)" | sed -E "s/^.*NOTICE: +//"
PASS=$(echo "$OUT" | grep -c "NOTICE: *PASS" || true)
FAIL=$(echo "$OUT" | grep -c "NOTICE: *FAIL" || true)
echo ""
echo "PASS: $PASS   FAIL: $FAIL"
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D "${WLA_PGDIR:-/tmp/wla-lms/pg}/$PORT" stop >/dev/null 2>&1 || true
[ "$FAIL" -eq 0 ]
