#!/usr/bin/env bash
# Mission cover storage policies against the local stack. One transaction, rolled back.
set -euo pipefail
out=$(docker exec -i supabase_db_WLA psql -U postgres -d postgres -X -A -t -q < "$(dirname "$0")/cover-regression.sql" 2>&1 | grep -E '^(PASS|FAIL|ERROR|psql:)' || true)
echo "$out"
if echo "$out" | grep -qE '^(FAIL  |ERROR|psql:)' || echo "$out" | grep -qE '^PASS: .*FAIL: [1-9]'; then exit 1; fi
