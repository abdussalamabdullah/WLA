-- ============================================================================
-- Fix: start_mission could no longer find a mission's first screen.
--
-- FOUND BY LIVE EXECUTION, not by source-level tests.
--
-- Migration 0007 removed every client read policy from mission_screens so that
-- staged information could not be fetched ahead of its reveal. start_mission
-- was `security invoker`, so it runs as the calling `authenticated` role — and
-- that role lost its read access along with everyone else.
--
-- The effect: `select s.screen_key ... from mission_screens` returned NULL, so
-- a newly started mission had current_screen_key = null, and
-- get_current_mission_screen then correctly returned nothing. Every mission
-- would have opened on "this mission isn't ready to start yet".
--
-- Fix: start_mission becomes `security definer`, like
-- get_current_mission_screen. That is safe because it already re-establishes
-- the full chain itself — ownership and entitlement are both checked before
-- anything is read or written, and neither check is weakened by running as
-- the definer. auth.uid() still reflects the CALLER, so owns_child() behaves
-- exactly as before.
-- ============================================================================

create or replace function start_mission(p_child_id uuid, p_mission_id uuid)
returns mission_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress     mission_progress;
  v_first_screen text;
  v_version      int;
  v_rule         jsonb;
begin
  -- Unchanged, and now load-bearing: as a definer this function is the one
  -- enforcing access, so both checks must run before anything else.
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
      -- D-17: an existing run keeps its version and completion semantics.
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

revoke all on function start_mission(uuid, uuid) from public;
grant execute on function start_mission(uuid, uuid) to authenticated;
