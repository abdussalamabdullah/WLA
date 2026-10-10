-- ===========================================================================
-- VERSION LIFECYCLE OF SEEDED MISSIONS (D-111) — executed, not read.
--
-- Run by scripts/run-version-lifecycle.sh against a throwaway cluster built by
-- scripts/local-db.sh: real migrations, then the real seeds in config order,
-- the last of which calls private.backfill_mission_version_lifecycle(). No
-- manual backfill and no disabled trigger, so section A is the fresh-database
-- path exactly as `supabase start` / `db reset` take it.
--
--   A. Six Names after a fresh initialisation
--   B. Who can execute the backfill
--   C. Edge cases, each in its own rolled-back transaction
-- ===========================================================================
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned

create or replace function chk(p_label text, p_ok boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when coalesce(p_ok, false) then 'PASS' else 'FAIL' end, p_label;
end $$;

-- Everything the backfill could write, row by row, ids included.
create or replace function lifecycle_digest() returns text
language sql as $$
  select md5(coalesce(string_agg(t, '|' order by t), '')) from (
    select 'v:'||mission_id||':'||version||':'||status||':'||coalesce(completion_rule::text,'') from mission_versions
    union all
    select 'r:'||id||':'||mission_id||':'||version||':'||storage_path||':'||title from mission_resources
    union all
    select 'n:'||id||':'||mission_id||':'||version||':'||md5(content) from mission_parent_notes
  ) x(t);
$$;

-- A mission with screens at the given versions (none if empty).
create or replace function mk_mission(p_slug text, p_version int, p_screen_versions int[])
returns uuid language plpgsql as $$
declare v_id uuid; v int;
begin
  insert into missions (slug, title, lab, min_age, max_age, version, completion_rule)
  values (p_slug, p_slug, 'curiosity', 8, 12, p_version,
          jsonb_build_object('type', 'conditions', 'conditions', jsonb_build_array()))
  returning id into v_id;
  foreach v in array p_screen_versions loop
    insert into mission_screens (mission_id, version, screen_key, type, sequence)
    values (v_id, v, 's'||v, 'content', 10);
  end loop;
  return v_id;
end $$;

create or replace function mk_kit(p_mission uuid, p_version int, p_path text) returns uuid
language sql as $$
  insert into mission_resources (mission_id, version, title, storage_path, sort_order)
  values (p_mission, p_version, p_path, p_mission||'/'||p_path, 1) returning id;
$$;

-- ===========================================================================
\echo ======================== A. Six Names after fresh initialisation ========
-- ===========================================================================
select chk('A1 all four immutability/guard triggers are enabled',
  (select count(*) = 4 from pg_trigger
    where tgname in ('mission_resources_immutable','mission_parent_notes_immutable',
                     'mission_screens_immutable','mission_versions_guard')
      and tgenabled = 'O'));

select chk('A2 v1 archived: archived_at set, published_at null, no rule',
  exists (select 1 from mission_versions mv join missions m on m.id = mv.mission_id
           where m.slug = 'six-names' and mv.version = 1 and mv.status = 'archived'
             and mv.archived_at is not null and mv.published_at is null and mv.completion_rule is null));
select chk('A3 v2 published: published_at set, rule equals the mission''s',
  exists (select 1 from mission_versions mv join missions m on m.id = mv.mission_id
           where m.slug = 'six-names' and mv.version = 2 and mv.status = 'published'
             and mv.published_at is not null and mv.archived_at is null
             and mv.completion_rule = m.completion_rule));
select chk('A4 exactly two version rows for Six Names',
  (select count(*) = 2 from mission_versions mv join missions m on m.id = mv.mission_id where m.slug = 'six-names'));

select chk('A5 Kit: 5 rows at v1 and 5 at v2',
  (select count(*) filter (where r.version = 1) = 5 and count(*) filter (where r.version = 2) = 5
     from mission_resources r join missions m on m.id = r.mission_id where m.slug = 'six-names'));
select chk('A6 Kit identical across v1/v2 (title, description, type, path, flags, order)',
  (select count(*) = 5 from mission_resources a join mission_resources b
     on a.mission_id = b.mission_id and a.storage_path = b.storage_path and a.version = 1 and b.version = 2
    and a.title = b.title and a.description is not distinct from b.description and a.type = b.type
    and a.sort_order = b.sort_order and a.can_view = b.can_view and a.can_print = b.can_print
    and a.can_download = b.can_download
    join missions m on m.id = a.mission_id where m.slug = 'six-names'));
select chk('A7 Child Mission is first in the v2 Kit',
  (select r.title = 'Child Mission' from mission_resources r join missions m on m.id = r.mission_id
    where m.slug = 'six-names' and r.version = 2 order by r.sort_order limit 1));
select chk('A8 parent note at v1 and v2, identical content and document',
  (select count(*) = 2 and count(distinct md5(content)) = 1 and count(distinct document_path) = 1
     from mission_parent_notes n join missions m on m.id = n.mission_id where m.slug = 'six-names'));

select chk('A9 a new run pins to v2 (effective_mission_version)',
  effective_mission_version(gen_random_uuid(), (select id from missions where slug = 'six-names')) = 2);
select chk('A10 every Kit and parent-note file is released',
  (select bool_and(private.mission_file_released('mission-resources', p)) and count(*) = 6 from (
     select storage_path p from mission_resources r join missions m on m.id = r.mission_id where m.slug = 'six-names'
     union select document_path from mission_parent_notes n join missions m on m.id = n.mission_id where m.slug = 'six-names') x));
select chk('A11 screens untouched: 21 at v1, 27 at v2',
  (select count(*) filter (where s.version = 1) = 21 and count(*) filter (where s.version = 2) = 27
     from mission_screens s join missions m on m.id = s.mission_id where m.slug = 'six-names'));

do $$ declare m uuid := (select id from missions where slug = 'six-names'); ok boolean;
begin
  begin update mission_resources set title = title where mission_id = m and version = 2; ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform chk('A12 published v2 Kit is immutable', ok);
  begin update mission_resources set title = title where mission_id = m and version = 1; ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform chk('A13 archived v1 Kit is immutable', ok);
  begin update mission_parent_notes set content = content where mission_id = m and version = 2; ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform chk('A14 published v2 parent note is immutable', ok);
  begin update mission_screens set title = title where mission_id = m and version = 2; ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform chk('A15 published v2 screens are immutable', ok);
  begin update mission_versions set completion_rule = '{}'::jsonb where mission_id = m and version = 2; ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform chk('A16 published v2 structure (completion rule) is immutable', ok);
  begin insert into mission_resources (mission_id, version, title, storage_path) values (m, 2, 'x', 'x'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform chk('A17 nothing can be added to the published v2 Kit', ok);
end $$;

-- The validator set_mission_version_status runs before publishing, as the
-- fixture admin, in a transaction that is rolled back.
begin;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true) is not null;
select chk('A18 validator runs as an admin (is_admin() true)', is_admin());
select chk('A19 Six Names v2 passes validate_mission_version: 0 blocking',
  (select count(*) = 0 from validate_mission_version((select id from missions where slug = 'six-names'), 2) where blocking));
select chk('A20 Six Names v2: 0 advisory findings either',
  (select count(*) = 0 from validate_mission_version((select id from missions where slug = 'six-names'), 2)));
rollback;

create temp table digest_a as select lifecycle_digest() d;
select chk('A21 idempotent: a second call initialises 0 missions',
  private.backfill_mission_version_lifecycle() = 0);
select chk('A22 idempotent: nothing changed', (select d from digest_a) = lifecycle_digest());

-- ===========================================================================
\echo ======================== B. Who can execute the backfill ================
-- ===========================================================================
select chk('B1 SECURITY INVOKER, not definer',
  not (select prosecdef from pg_proc where oid = 'private.backfill_mission_version_lifecycle()'::regprocedure));
select chk('B2 PUBLIC holds no privilege on it',
  not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where p.oid = 'private.backfill_mission_version_lifecycle()'::regprocedure and a.grantee = 0));
select chk('B3 anon cannot execute',
  not has_function_privilege('anon', 'private.backfill_mission_version_lifecycle()', 'EXECUTE'));
select chk('B4 authenticated cannot execute',
  not has_function_privilege('authenticated', 'private.backfill_mission_version_lifecycle()', 'EXECUTE'));
select chk('B5 service_role cannot execute',
  not has_function_privilege('service_role', 'private.backfill_mission_version_lifecycle()', 'EXECUTE'));
select chk('B6 authenticated still has USAGE on private (why the revoke matters)',
  has_schema_privilege('authenticated', 'private', 'USAGE'));

create or replace function try_as(p_role text) returns text
language plpgsql as $$
begin
  execute format('set local role %I', p_role);
  begin
    perform private.backfill_mission_version_lifecycle();
    return 'executed';
  exception when insufficient_privilege then return 'denied';
  end;
end $$;
begin; select chk('B7 calling it as authenticated is denied', try_as('authenticated') = 'denied'); rollback;
begin; select chk('B8 calling it as anon is denied', try_as('anon') = 'denied'); rollback;

-- ===========================================================================
\echo ======================== C. Edge cases (each rolled back) ===============
-- ===========================================================================

-- C1 Explicitly versioned Kit at BOTH versions; note only at v1.
begin;
create temp table c1 as select mk_mission('lc-both', 2, array[1,2]) id;
create temp table c1k as select mk_kit((select id from c1), 1, 'a.pdf') a, mk_kit((select id from c1), 2, 'b.pdf') b;
insert into mission_parent_notes (mission_id, version, content) select id, 1, 'note v1' from c1;
create temp table c1n as select n.id from mission_parent_notes n, c1 where n.mission_id = c1.id;
select chk('C1a initialises exactly the one new mission', private.backfill_mission_version_lifecycle() = 1);
select chk('C1b v1 Kit is still exactly a.pdf, same row',
  (select array_agg(id) = array[(select a from c1k)] from mission_resources where mission_id = (select id from c1) and version = 1));
select chk('C1c v2 Kit is still exactly b.pdf, same row',
  (select array_agg(id) = array[(select b from c1k)] from mission_resources where mission_id = (select id from c1) and version = 2));
select chk('C1d v1 note unchanged and still at v1',
  exists (select 1 from mission_parent_notes where id = (select id from c1n) and version = 1 and content = 'note v1'));
select chk('C1e v2 (no note) inherits a copy of the v1 note',
  exists (select 1 from mission_parent_notes where mission_id = (select id from c1) and version = 2
           and content = 'note v1' and id <> (select id from c1n)));
select chk('C1f v1 archived, v2 published',
  (select string_agg(version||status::text, ',' order by version) = '1archived,2published'
     from mission_versions where mission_id = (select id from c1)));
rollback;

-- C2 Explicit Kit only at v1; the CURRENT version (v2) has none.
begin;
create temp table c2 as select mk_mission('lc-v1-only', 2, array[1,2]) id;
create temp table c2k as select mk_kit(id, 1, 'one.pdf') k from c2 union all select mk_kit(id, 1, 'two.pdf') from c2;
select chk('C2a initialises the mission', private.backfill_mission_version_lifecycle() = 1);
select chk('C2b both v1 rows are untouched: same ids, still at v1',
  (select count(*) = 2 from mission_resources r join c2k on r.id = c2k.k where r.version = 1));
select chk('C2c current v2 receives copies of the v1 Kit (same paths), as new rows',
  (select count(*) = 2 and bool_and(r.id not in (select k from c2k))
     from mission_resources r where r.mission_id = (select id from c2) and r.version = 2
      and r.storage_path in (select storage_path from mission_resources where id in (select k from c2k))));
select chk('C2d no Kit row was moved: v1 still has exactly its 2',
  (select count(*) = 2 from mission_resources where mission_id = (select id from c2) and version = 1));
rollback;

-- C3 Explicit Kit only at the current v2; older v1 has none.
begin;
create temp table c3 as select mk_mission('lc-v2-only', 2, array[1,2]) id;
create temp table c3k as select mk_kit(id, 2, 'cur.pdf') k from c3;
select chk('C3a initialises the mission', private.backfill_mission_version_lifecycle() = 1);
select chk('C3b v2 row untouched (same id, still v2)',
  exists (select 1 from mission_resources where id = (select k from c3k) and version = 2));
select chk('C3c v1 inherits from the nearest higher version',
  (select count(*) = 1 from mission_resources where mission_id = (select id from c3) and version = 1
     and storage_path like '%/cur.pdf' and id <> (select k from c3k)));
rollback;

-- C4 A seeded mission with NO screens and no Kit.
begin;
create temp table c4 as select mk_mission('lc-noscreens', 1, array[]::int[]) id;
select chk('C4a initialises the mission', private.backfill_mission_version_lifecycle() = 1);
select chk('C4b exactly one version row: its current version',
  (select count(*) = 1 and min(version) = 1 from mission_versions where mission_id = (select id from c4)));
select chk('C4c that row is published, published_at set, rule = the mission''s',
  exists (select 1 from mission_versions mv join missions m on m.id = mv.mission_id
           where m.id = (select id from c4) and mv.status = 'published' and mv.published_at is not null
             and mv.completion_rule = m.completion_rule));
select chk('C4d no Kit or note was invented',
  not exists (select 1 from mission_resources where mission_id = (select id from c4))
  and not exists (select 1 from mission_parent_notes where mission_id = (select id from c4)));
rollback;

-- C5 A seeded version NEWER than missions.version becomes a draft, not history.
begin;
create temp table c5 as select mk_mission('lc-draft', 1, array[1,2]) id;
select mk_kit(id, 1, 'k.pdf') from c5;
select chk('C5a initialises the mission', private.backfill_mission_version_lifecycle() = 1);
select chk('C5b v1 published, v2 draft',
  (select string_agg(version||status::text, ',' order by version) = '1published,2draft'
     from mission_versions where mission_id = (select id from c5)));
do $$ declare ok boolean; m uuid := (select id from c5);
begin
  begin update mission_resources set title = 'edited' where mission_id = m and version = 2; ok := true;
  exception when insufficient_privilege then ok := false; end;
  perform chk('C5c the draft v2 Kit stays editable', ok);
  begin update mission_resources set title = title where mission_id = m and version = 1; ok := false;
  exception when insufficient_privilege then ok := true; end;
  perform chk('C5d the published v1 Kit is locked', ok);
end $$;
rollback;

-- C6 A PARTIAL lifecycle is refused, atomically, and names the mission.
begin;
create temp table c6 as select mk_mission('lc-partial', 2, array[1,2]) id;
insert into mission_versions (mission_id, version, status, published_at)
  select id, 2, 'published', now() from c6;                    -- v1 row missing
create temp table c6q as select mk_mission('lc-innocent', 1, array[1]) id;  -- no lifecycle at all
create temp table c6d as select lifecycle_digest() d;
do $$ declare ok boolean := false; msg text;
begin
  begin perform private.backfill_mission_version_lifecycle();
  exception when check_violation then ok := true; msg := sqlerrm; end;
  perform chk('C6a raises check_violation', ok);
  perform chk('C6b the error names the mission and the missing version',
    coalesce(msg like '%lc-partial (missing v1)%', false));
end $$;
select chk('C6c nothing was written — not even for the innocent mission',
  (select d from c6d) = lifecycle_digest()
  and not exists (select 1 from mission_versions where mission_id = (select id from c6q)));
select chk('C6d the partial mission''s existing published row is untouched',
  (select count(*) = 1 from mission_versions where mission_id = (select id from c6) and version = 2 and status = 'published'));
rollback;

-- C7 A mission with a COMPLETE lifecycle (as the builder makes them) is left alone.
begin;
create temp table c7 as select mk_mission('lc-builder', 1, array[1]) id;
select mk_kit(id, 1, 'b.pdf') from c7;
insert into mission_versions (mission_id, version, status, published_at) select id, 1, 'published', now() from c7;
create temp table c7d as select lifecycle_digest() d;
select chk('C7a a complete lifecycle is not selected (0 initialised)', private.backfill_mission_version_lifecycle() = 0);
select chk('C7b and nothing changed', (select d from c7d) = lifecycle_digest());
rollback;

-- C8 Several lifecycle-less missions in one call; then idempotent.
begin;
select mk_mission('lc-m1', 1, array[1]); select mk_mission('lc-m2', 3, array[1,2,3]);
select chk('C8a initialises both', private.backfill_mission_version_lifecycle() = 2);
select chk('C8b lc-m2: v1,v2 archived, v3 published',
  (select string_agg(mv.version||mv.status::text, ',' order by mv.version) = '1archived,2archived,3published'
     from mission_versions mv join missions m on m.id = mv.mission_id where m.slug = 'lc-m2'));
select chk('C8c a second call initialises 0', private.backfill_mission_version_lifecycle() = 0);
rollback;

select chk('Z1 the rolled-back edge cases left no trace',
  not exists (select 1 from missions where slug like 'lc-%') and (select d from digest_a) = lifecycle_digest());
