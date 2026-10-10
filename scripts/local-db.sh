#!/bin/zsh
# Build a throwaway local PostgreSQL matching the hosted schema.
#   scripts/local-db.sh <port> [--with-fixtures]
# Prints "ready" on success. Used by the regression runners.
set -e
PORT=${1:-55450}
R=$(cd "$(dirname "$0")/.." && pwd)
B=/opt/homebrew/opt/postgresql@16/bin
P=/opt/homebrew/bin/psql
D=${WLA_PGDIR:-/tmp/wla-lms/pg}/$PORT

$B/pg_ctl -D $D stop >/dev/null 2>&1 || true
rm -rf $D && mkdir -p $(dirname $D)
$B/initdb -D $D -U postgres -A trust >/dev/null 2>&1
$B/pg_ctl -D $D -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
  -l $D.log start >/dev/null 2>&1
for i in $(seq 1 40); do $P -h 127.0.0.1 -p $PORT -U postgres -c 'select 1' >/dev/null 2>&1 && break; done

$P -h 127.0.0.1 -p $PORT -U postgres -q -v ON_ERROR_STOP=1 -f $R/scripts/local-shim.sql >/dev/null
for f in $R/supabase/migrations/*.sql; do
  OUT=$($P -h 127.0.0.1 -p $PORT -U postgres -q -v ON_ERROR_STOP=1 -f "$f" 2>&1) \
    || { echo "MIGRATION FAILED: $(basename $f)"; echo "$OUT" | grep -i error | head -3; exit 1; }
done
for f in six_names six_names_screens six_names_cover six_names_v2_screens six_names_v2_kit six_names_parent_note_document; do
  $P -h 127.0.0.1 -p $PORT -U postgres -q -v ON_ERROR_STOP=1 -f $R/supabase/seed/$f.sql >/dev/null 2>&1 \
    || echo "SEED FAILED: $f"
done

# The version lifecycle of the seeded missions is initialised by the LAST seed,
# exactly as `supabase start` / `db reset` do it (D-111) — no manual backfill,
# and no trigger is disabled. A failure here is fatal: without it the Kit and
# parent note are unreachable on every seeded mission.
OUT=$($P -h 127.0.0.1 -p $PORT -U postgres -q -v ON_ERROR_STOP=1 \
  -f $R/supabase/seed/mission_version_lifecycle.sql 2>&1) \
  || { echo "SEED FAILED: mission_version_lifecycle"; echo "$OUT" | grep -i error | head -3; exit 1; }

if [ "$2" = "--with-fixtures" ]; then
  $P -h 127.0.0.1 -p $PORT -U postgres -q -c "
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
    on conflict do nothing;" >/dev/null
fi
echo "ready"
