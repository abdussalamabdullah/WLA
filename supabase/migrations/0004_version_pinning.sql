-- ============================================================================
-- D-17 — pin an in-progress mission to the version it started with
--
-- Principle: "an existing learner's saved position and state must remain valid
-- against the mission definition they started with."
--
-- The minimal mechanism that achieves that, and deliberately NOT a publishing
-- system:
--
--   * mission_screens carries a version. Editing a mission means inserting
--     rows at version + 1; existing rows are left alone.
--   * mission_progress already records the version at first start.
--   * Screen loads filter by the learner's recorded version.
--   * The completion rule is snapshotted onto the progress row at start, so a
--     mid-run edit cannot change what "complete" means for someone already
--     playing.
--
-- What this is NOT: no publishing UI, no draft/live workflow, no diffing, no
-- migration of in-flight learners onto a new version, no version history view.
-- Mission content is authored as SQL seeds (D-08), so bumping a version is an
-- insert, not a feature.
-- ============================================================================

-- ------------------------------------------------------ versioned screens --
alter table mission_screens
  add column if not exists version int not null default 1;

-- One screen_key per mission per version. Two versions may share a key; that
-- is the point — the learner's saved current_screen_key stays meaningful.
alter table mission_screens
  drop constraint if exists mission_screens_mission_id_screen_key_key;

create unique index if not exists mission_screens_mission_version_key
  on mission_screens (mission_id, version, screen_key);

drop index if exists mission_screens_mission_id_sequence_idx;
create index if not exists mission_screens_mission_version_sequence_idx
  on mission_screens (mission_id, version, sequence);

-- --------------------------------------------- pinned completion semantics --
/*
 * Snapshot of missions.completion_rule as it stood when this run began.
 * Without it, editing a live mission's completion rule could leave an
 * in-flight child unable to finish — the exact failure D-17 exists to prevent.
 */
alter table mission_progress
  add column if not exists completion_rule jsonb;

-- ------------------------------------------------- start_mission, updated --
create or replace function start_mission(p_child_id uuid, p_mission_id uuid)
returns mission_progress
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_progress     mission_progress;
  v_first_screen text;
  v_version      int;
  v_rule         jsonb;
begin
  if not owns_child(p_child_id) then
    raise exception 'not_your_child' using errcode = '42501';
  end if;

  if not exists (
    select 1 from mission_entitlements e
    where e.child_id = p_child_id
      and e.mission_id = p_mission_id
      and e.status = 'active'
  ) then
    raise exception 'not_entitled' using errcode = '42501';
  end if;

  -- A NEW start uses the current published version.
  select m.version, m.completion_rule
    into v_version, v_rule
  from missions m
  where m.id = p_mission_id;

  select s.screen_key into v_first_screen
  from mission_screens s
  where s.mission_id = p_mission_id
    and s.version = coalesce(v_version, 1)
  order by s.sequence asc
  limit 1;

  insert into mission_progress (
    child_id, mission_id, status, current_screen_key,
    mission_version, completion_rule, started_at, last_activity_at
  )
  values (
    p_child_id, p_mission_id, 'in_progress', v_first_screen,
    coalesce(v_version, 1), v_rule, now(), now()
  )
  on conflict (child_id, mission_id) do update
    set
      status = case
        when mission_progress.status = 'not_started' then 'in_progress'
        else mission_progress.status
      end,
      started_at = coalesce(mission_progress.started_at, now()),
      current_screen_key = coalesce(
        mission_progress.current_screen_key, excluded.current_screen_key
      ),
      -- D-17: an existing run keeps its version and its completion semantics.
      -- These are pinned at first start and never re-pinned, including after
      -- completion.
      mission_version = mission_progress.mission_version,
      completion_rule = coalesce(
        mission_progress.completion_rule, excluded.completion_rule
      ),
      last_activity_at = case
        when mission_progress.status = 'complete'
          then mission_progress.last_activity_at
        else now()
      end,
      updated_at = now()
  returning * into v_progress;

  insert into mission_state (progress_id, state_data)
  values (v_progress.id, '{}'::jsonb)
  on conflict (progress_id) do nothing;

  return v_progress;
end;
$$;
