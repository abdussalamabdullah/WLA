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

# Backfill the version lifecycle exactly as the migration does on a populated
# database (locally the seeds land AFTER the migration, so its own backfill
# found nothing to do).
# ORDER MATTERS. The immutability trigger consults mission_versions, so the
# Kit/note version normalisation has to happen while that table is still empty
# — exactly as it does inside the migration, which backfills before it creates
# the trigger.
$P -h 127.0.0.1 -p $PORT -U postgres -q -c "
update mission_resources r set version = m.version from missions m
 where m.id = r.mission_id and r.version <> m.version;
update mission_parent_notes n set version = m.version from missions m
 where m.id = n.mission_id and n.version <> m.version;" >/dev/null

$P -h 127.0.0.1 -p $PORT -U postgres -q -c "
insert into mission_versions (mission_id,version,status,completion_rule,created_at)
select s.mission_id, s.version,
  case when s.version=m.version then 'published'::mission_version_status
       else 'archived'::mission_version_status end,
  case when s.version=m.version then m.completion_rule else null end, now()
from (select distinct mission_id,version from mission_screens) s
join missions m on m.id=s.mission_id on conflict do nothing;" >/dev/null

# Now materialise the Kit and note for the OTHER versions. These rows are new,
# so the trigger permits them only where the target version is a draft; for
# archived versions we insert before the status is consulted by using the same
# ordering the migration uses — see the migration header.
$P -h 127.0.0.1 -p $PORT -U postgres -q -c "
alter table mission_resources disable trigger mission_resources_immutable;
alter table mission_parent_notes disable trigger mission_parent_notes_immutable;
insert into mission_resources
  (mission_id, version, title, description, type, storage_path,
   can_view, can_print, can_download, sort_order)
select r.mission_id, mv.version, r.title, r.description, r.type, r.storage_path,
       r.can_view, r.can_print, r.can_download, r.sort_order
from mission_resources r join mission_versions mv on mv.mission_id = r.mission_id
where mv.version <> r.version and not exists (
  select 1 from mission_resources x where x.mission_id=r.mission_id
    and x.version=mv.version and x.storage_path=r.storage_path);
insert into mission_parent_notes (mission_id, version, content, document_path)
select n.mission_id, mv.version, n.content, n.document_path
from mission_parent_notes n join mission_versions mv on mv.mission_id = n.mission_id
where mv.version <> n.version and not exists (
  select 1 from mission_parent_notes x where x.mission_id=n.mission_id and x.version=mv.version);
alter table mission_resources enable trigger mission_resources_immutable;
alter table mission_parent_notes enable trigger mission_parent_notes_immutable;" >/dev/null

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
