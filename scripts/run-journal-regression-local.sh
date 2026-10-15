#!/bin/zsh
# The Journal regression against the REAL local WLA database (the running
# Supabase stack, container supabase_db_WLA), leaving nothing behind.
#
# Everything — fixture users, test articles, the S18 fault trigger, the helper
# functions — runs inside ONE transaction that is ROLLED BACK. Before and after,
# every public table, auth.users/identities and storage.buckets/objects is
# fingerprinted (row count + content hash); any difference is a failure.
# S25 runs with cron=present: here the scheduler MUST be configured, active and
# succeeding.
#
# Not included: the concurrency checks (M1–M3) and the real pg_cron
# publication, which need committed rows. They run in the isolated cluster
# (run-journal-regression.sh) and the throwaway container
# (run-journal-cron-check.sh).
#
#   scripts/run-journal-regression-local.sh
set -e
R=$(cd "$(dirname "$0")/.." && pwd)
C=supabase_db_WLA
docker inspect -f '{{.State.Running}}' $C 2>/dev/null | grep -q true || { echo "the local WLA database ($C) is not running"; exit 1; }
DB() { docker exec -i $C psql -U postgres -d postgres -X "$@"; }

FP=$(cat <<'SQL'
\pset tuples_only on
\pset format unaligned
select format('%s.%s|%s|%s', n.nspname, c.relname,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text,
  (xpath('/row/h/text()', query_to_xml(format('select md5(coalesce(string_agg(t::text, ''|'' order by t::text), '''')) as h from %I.%I t', n.nspname, c.relname), false, true, '')))[1]::text)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and (n.nspname = 'public' or (n.nspname, c.relname) in (('auth','users'),('auth','identities'),('storage','buckets'),('storage','objects')))
order by 1;
SQL
)
BEFORE=$(echo "$FP" | DB -q)

# The same fixtures as scripts/local-db.sh --with-fixtures (test ids that real
# accounts never use), then the regression, then ROLLBACK.
OUT=$( { cat <<'SQL'
begin;
insert into auth.users (id,email) values
  ('aaaaaaaa-0000-0000-0000-000000000001','admin@t.test'),
  ('aaaaaaaa-0000-0000-0000-000000000002','parent1@t.test'),
  ('aaaaaaaa-0000-0000-0000-000000000003','parent2@t.test') on conflict do nothing;
insert into profiles (id,email,is_admin) values
  ('aaaaaaaa-0000-0000-0000-000000000001','admin@t.test',true),
  ('aaaaaaaa-0000-0000-0000-000000000002','parent1@t.test',false),
  ('aaaaaaaa-0000-0000-0000-000000000003','parent2@t.test',false)
  on conflict (id) do update set is_admin=excluded.is_admin;
insert into child_profiles (id,parent_id,display_name) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002','ChildA'),
  ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002','SiblingB'),
  ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000003','OtherFamily')
  on conflict do nothing;
insert into mission_entitlements (child_id,mission_id,source)
  select 'bbbbbbbb-0000-0000-0000-000000000001', id, 'admin' from missions where slug='six-names'
  on conflict do nothing;
\set cron present
SQL
  cat "$R/scripts/journal-regression.sql"
  printf '\nreset role;\nrollback;\n'
} | DB 2>&1 )

echo "$OUT" | grep -E "(PASS|FAIL|========|ERROR:)" | sed -E "s/^.*NOTICE: +//"
AFTER=$(echo "$FP" | DB -q)

PASS=$(echo "$OUT" | grep -c "NOTICE: *PASS" || true)
FAIL=$(( $(echo "$OUT" | grep -c "NOTICE: *FAIL" || true) + $(echo "$OUT" | grep -c "ERROR:" || true) ))
echo "======================== Nothing left behind"
if echo "$OUT" | tail -3 | grep -q "^ROLLBACK$"; then
  echo "PASS  Z1 the whole run ended in ROLLBACK"; PASS=$((PASS+1))
else
  echo "FAIL  Z1 the run did not end in ROLLBACK"; FAIL=$((FAIL+1))
fi
if [ "$BEFORE" = "$AFTER" ] && [ -n "$BEFORE" ]; then
  echo "PASS  Z2 every table is identical before and after ($(echo "$BEFORE" | wc -l | tr -d ' ') tables, counts and content)"; PASS=$((PASS+1))
else
  echo "FAIL  Z2 tables changed:"; diff <(echo "$BEFORE" | cut -d'|' -f1,2) <(echo "$AFTER" | cut -d'|' -f1,2) | grep '^[<>]' || true; FAIL=$((FAIL+1))
fi
echo ""
echo "PASS: $PASS   FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
