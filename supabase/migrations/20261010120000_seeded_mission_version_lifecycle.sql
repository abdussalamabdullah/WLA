-- ============================================================================
-- Version lifecycle for SEEDED missions (D-111)
-- ============================================================================
--
-- 20260929100000 (mission_versions) and 20260929110000 (Kit/note versioning)
-- each end in a one-off backfill over rows that already exist. On staging the
-- seeds had run first, so both found Six Names and initialised it. On a FRESH
-- database the order is reversed — `supabase start` / `db reset` apply every
-- migration, then the seeds — so both backfills found empty tables and the
-- seeds then created a mission with:
--
--   * no mission_versions rows at all, so `private.mission_file_released`
--     refuses every Kit and parent-note file; and
--   * its Kit and parent note at the column default (version 1) while
--     `missions.version` is 2, so a v2 run finds no Kit and no note.
--
-- scripts/local-db.sh hid this by re-running the backfill by hand, with the
-- immutability triggers disabled. This replaces that with one function the
-- seeds call last (supabase/seed/mission_version_lifecycle.sql) and the
-- harness simply runs as a seed.
--
-- WHAT IT DOES, per mission that has NO mission_versions rows:
--
--   versions = every version with screens, plus missions.version
--
--   1. Kit and parent note. A version with NO Kit rows inherits the Kit of the
--      nearest lower version that has one, else the nearest higher; the parent
--      note the same. Rows that exist are never moved, edited or deleted, so a
--      seed that versions its Kit explicitly keeps exactly what it wrote.
--      (Before versioning the Kit applied to every version, which is why an
--      empty version inherits — and why absence cannot mean "no Kit here".)
--   2. One mission_versions row per version: missions.version 'published'
--      with the mission's completion rule; lower versions 'archived' (history,
--      still playable by runs pinned to them); higher versions 'draft'.
--      Timestamps are set in the INSERT, so mission_versions_guard (BEFORE
--      UPDATE) is never involved.
--
-- Step 1 runs before step 2 because the *_immutable triggers consult
-- mission_versions: while a mission has no rows there, its Kit and note are
-- writable; afterwards published and archived versions are locked. No trigger
-- is disabled and no constraint is bypassed.
--
-- WHAT IT REFUSES. A mission that has SOME mission_versions rows but is
-- missing one for a version it needs is inconsistent — that is not the state
-- this backfill was written for, and quietly completing it could mint a
-- 'published' version nobody validated. The whole call raises, naming every
-- such mission, before anything is written. Missions with a complete lifecycle
-- (everything made in the builder, every staging mission) are left alone.
--
-- 'published' here is what the original backfill did for live content; it is
-- NOT missions.published, and it does not run validate_mission_version, which
-- needs an admin session. The regression suite runs the validator instead.
--
-- Idempotent: once a mission has rows it is never selected again, so a second
-- call returns 0 and changes nothing.
-- ============================================================================

create or replace function private.backfill_mission_version_lifecycle()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_partial text;
  v_mission record;
  v_version integer;
  v_initialised integer := 0;
begin
  -- Refuse an inconsistent lifecycle before writing anything.
  select string_agg(format('%s (missing v%s)', p.slug, p.missing), '; ' order by p.slug)
    into v_partial
  from (
    select m.slug, string_agg(need.version::text, ', v' order by need.version) as missing
    from missions m
    cross join lateral (
      select s.version from mission_screens s where s.mission_id = m.id
      union
      select m.version
    ) need
    where exists (select 1 from mission_versions mv where mv.mission_id = m.id)
      and not exists (
        select 1 from mission_versions mv
        where mv.mission_id = m.id and mv.version = need.version
      )
    group by m.slug
  ) p;

  if v_partial is not null then
    raise exception 'mission version lifecycle is partially populated: %', v_partial
      using errcode = '23514',
            hint = 'This backfill only initialises missions with no lifecycle. '
                || 'Repair through create_mission_version / set_mission_version_status.';
  end if;

  for v_mission in
    select m.id, m.version, m.completion_rule
    from missions m
    where not exists (select 1 from mission_versions mv where mv.mission_id = m.id)
    order by m.id
    for update of m
  loop
    for v_version in
      select s.version from mission_screens s where s.mission_id = v_mission.id
      union
      select v_mission.version
      order by 1
    loop
      if not exists (
        select 1 from mission_resources r
        where r.mission_id = v_mission.id and r.version = v_version
      ) then
        insert into mission_resources
          (mission_id, version, title, description, type, storage_path,
           can_view, can_print, can_download, sort_order)
        select r.mission_id, v_version, r.title, r.description, r.type, r.storage_path,
               r.can_view, r.can_print, r.can_download, r.sort_order
        from mission_resources r
        where r.mission_id = v_mission.id
          and r.version = (
            select r2.version from mission_resources r2
            where r2.mission_id = v_mission.id
            order by (r2.version > v_version), abs(r2.version - v_version)
            limit 1
          );
      end if;

      if not exists (
        select 1 from mission_parent_notes n
        where n.mission_id = v_mission.id and n.version = v_version
      ) then
        insert into mission_parent_notes (mission_id, version, content, document_path)
        select n.mission_id, v_version, n.content, n.document_path
        from mission_parent_notes n
        where n.mission_id = v_mission.id
          and n.version = (
            select n2.version from mission_parent_notes n2
            where n2.mission_id = v_mission.id
            order by (n2.version > v_version), abs(n2.version - v_version)
            limit 1
          );
      end if;
    end loop;

    insert into mission_versions
      (mission_id, version, status, completion_rule, created_at, published_at, archived_at)
    select v_mission.id,
           need.version,
           case
             when need.version = v_mission.version then 'published'::mission_version_status
             when need.version < v_mission.version then 'archived'::mission_version_status
             else 'draft'::mission_version_status
           end,
           case when need.version = v_mission.version then v_mission.completion_rule end,
           now(),
           case when need.version = v_mission.version then now() end,
           case when need.version < v_mission.version then now() end
    from (
      select s.version from mission_screens s where s.mission_id = v_mission.id
      union
      select v_mission.version
    ) need;

    v_initialised := v_initialised + 1;
  end loop;

  return v_initialised;
end;
$$;

-- A privileged data repair, never a client operation. `private` has no default
-- ACL, so a new function would otherwise be EXECUTE-able by PUBLIC — and
-- `authenticated` holds USAGE on this schema. Revoked from PUBLIC and, in case
-- a platform default ever grants them directly, from each API role.
revoke all on function private.backfill_mission_version_lifecycle() from public;
revoke all on function private.backfill_mission_version_lifecycle()
  from anon, authenticated, service_role;

-- Initialise anything already present. On an environment whose missions all
-- have a lifecycle this returns 0 and writes nothing.
select private.backfill_mission_version_lifecycle();
