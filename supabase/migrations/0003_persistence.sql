-- ============================================================================
-- Sprint 6 — mission persistence
--
-- Tech Spec §32: completion "should happen reliably and ideally atomically
-- where multiple database writes are involved. The child should not see
-- 'Complete' in the interface while the backend still considers the mission
-- incomplete."
--
-- Every operation below touches two or three tables, so each is a single
-- Postgres function and therefore a single transaction. A partial write is
-- impossible; the whole call rolls back.
--
-- All functions are SECURITY INVOKER — RLS still applies. They additionally
-- re-check ownership so they are safe even if called directly.
-- ============================================================================

-- Tech Spec §31: completion is determined by mission configuration, never by
-- `if (missionId === "mars")`. Shape is validated by zod in the engine
-- (features/mission-engine/schemas.ts → completionRule).
alter table missions
  add column if not exists completion_rule jsonb;

-- ---------------------------------------------------------- start mission --
/*
 * Tech Spec §27: "Do not create duplicate progress records every time Start is
 * clicked." Enforced three ways: the unique constraint on
 * (child_id, mission_id), the ON CONFLICT clause here, and the status guard.
 *
 * Architecture §17: a completed mission must not restart. Mission replay is
 * explicitly deferred, so `complete` is terminal.
 */
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
begin
  -- Defence in depth: lib/permissions has already checked both of these.
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

  select m.version into v_version from missions m where m.id = p_mission_id;

  -- Tech Spec §53: record the version this run began under, so editing a live
  -- mission cannot silently corrupt an in-flight child's state.
  select s.screen_key into v_first_screen
  from mission_screens s
  where s.mission_id = p_mission_id
  order by s.sequence asc
  limit 1;

  insert into mission_progress (
    child_id, mission_id, status, current_screen_key,
    mission_version, started_at, last_activity_at
  )
  values (
    p_child_id, p_mission_id, 'in_progress', v_first_screen,
    coalesce(v_version, 1), now(), now()
  )
  on conflict (child_id, mission_id) do update
    set
      -- Only a not_started row transitions. An in_progress row resumes
      -- untouched; a complete row is never restarted.
      status = case
        when mission_progress.status = 'not_started' then 'in_progress'
        else mission_progress.status
      end,
      started_at = coalesce(mission_progress.started_at, now()),
      -- Never overwrite a saved position: this is what makes Start idempotent
      -- and what makes Continue return to the right place.
      current_screen_key = coalesce(
        mission_progress.current_screen_key, excluded.current_screen_key
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

-- --------------------------------------------------------- persist state ---
/*
 * One transaction for: mission state, the optional response row, and the
 * child's position. These three must never diverge — a saved answer whose
 * state was not recorded would be invisible to completion evaluation.
 *
 * Tech Spec §29 saves at meaningful interaction points only.
 */
create or replace function persist_mission_state(
  p_progress_id    uuid,
  p_state          jsonb,
  p_screen_key     text default null,
  p_response_key   text default null,
  p_response_value jsonb default null
)
returns mission_progress
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_progress mission_progress;
begin
  if not owns_progress(p_progress_id) then
    raise exception 'not_your_record' using errcode = '42501';
  end if;

  -- A completed mission's state is final (Architecture §17).
  select * into v_progress from mission_progress where id = p_progress_id;
  if v_progress.status = 'complete' then
    return v_progress;
  end if;

  insert into mission_state (progress_id, state_data, updated_at)
  values (p_progress_id, p_state, now())
  on conflict (progress_id) do update
    set state_data = excluded.state_data, updated_at = now();

  if p_response_key is not null then
    insert into mission_responses (progress_id, screen_key, value)
    values (p_progress_id, p_response_key, coalesce(p_response_value, 'null'::jsonb))
    on conflict (progress_id, screen_key) do update
      set value = excluded.value, updated_at = now();
  end if;

  update mission_progress
  set current_screen_key = coalesce(p_screen_key, current_screen_key),
      last_activity_at   = now(),
      updated_at         = now()
  where id = p_progress_id
  returning * into v_progress;

  return v_progress;
end;
$$;

-- ------------------------------------------------------- complete mission --
/*
 * Tech Spec §32's completion transaction. State is written FIRST, then the
 * status flips — and because both happen inside one function, a failure at
 * either point rolls back the other. The interface cannot show "Complete"
 * over unpersisted state.
 *
 * Idempotent: a second call returns the existing record without moving
 * completed_at.
 */
create or replace function complete_mission(p_progress_id uuid, p_state jsonb)
returns mission_progress
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_progress mission_progress;
begin
  if not owns_progress(p_progress_id) then
    raise exception 'not_your_record' using errcode = '42501';
  end if;

  insert into mission_state (progress_id, state_data, updated_at)
  values (p_progress_id, p_state, now())
  on conflict (progress_id) do update
    set state_data = excluded.state_data, updated_at = now();

  update mission_progress
  set status           = 'complete',
      completed_at     = coalesce(completed_at, now()),
      last_activity_at = now(),
      updated_at       = now()
  where id = p_progress_id
  returning * into v_progress;

  return v_progress;
end;
$$;
