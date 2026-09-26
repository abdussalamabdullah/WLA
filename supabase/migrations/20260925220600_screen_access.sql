-- ============================================================================
-- Sprint 9 — server-authoritative staged information  (C9-1 / Q4)
--
-- THE PROBLEM
-- Migration 0001's `screens require entitlement` policy let any entitled
-- family read EVERY mission_screens row directly from the API. Later Evidence,
-- both unrevealed consequence sets and the explanation of the list were all
-- readable before the Academy revealed them. Sequence position protected the
-- interface, not the data.
--
-- Six Names Build Brief §10 requires: "The child cannot access Later Evidence
-- before the Academy reveals it." The Parent Note is equally explicit that
-- "the Academy controls the staged information ... so that the child only
-- knows what the case has revealed at each point."
--
-- THE FIX — treated as a security requirement, not a Six Names UI detail.
-- mission_screens becomes unreadable through the client path entirely. Screen
-- content is reachable only through a security-definer function that
-- re-establishes the full chain itself:
--
--     authenticated parent → owns child → child entitled → mission
--                          → and the child has actually REACHED this screen
--
-- The client receives exactly one screen: the one it is currently authorised
-- to see. Future screens are not merely hidden — they are never sent.
-- ============================================================================

-- ------------------------------------------------ revoke the client path ---
drop policy if exists "screens require entitlement" on mission_screens;

-- RLS stays enabled with no SELECT policy, so the anon and authenticated roles
-- cannot read this table at all. `admins manage mission screens` (0002)
-- remains for content authoring.
--
-- Note: this also blocks our own server client, which uses the anon key with
-- the user's session. That is intentional — screen reads now go through the
-- function below, where the stage check lives.

-- ------------------------------------------- authorised screen retrieval ---
/*
 * Return the child's CURRENT screen, and nothing else.
 *
 * `next_sequence_key` is included so the engine can advance when a screen has
 * no explicit branch target. It is a key, not content — it reveals the name of
 * the next step, never what that step says.
 *
 * security definer so it can read mission_screens, which is otherwise closed.
 * Every authorisation check is therefore performed HERE, explicitly.
 */
create or replace function get_current_mission_screen(
  p_child_id   uuid,
  p_mission_id uuid
)
returns table (
  screen_key        text,
  type              screen_type,
  title             text,
  body              text,
  sequence          int,
  configuration     jsonb,
  next_sequence_key text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_progress mission_progress;
begin
  -- 1. the caller owns this child
  if not owns_child(p_child_id) then
    raise exception 'not_your_child' using errcode = '42501';
  end if;

  -- 2. the child is entitled to this mission
  if not exists (
    select 1 from mission_entitlements e
    where e.child_id = p_child_id
      and e.mission_id = p_mission_id
      and e.status = 'active'
  ) then
    raise exception 'not_entitled' using errcode = '42501';
  end if;

  -- 3. the child has started, and is somewhere specific
  select * into v_progress
  from mission_progress p
  where p.child_id = p_child_id and p.mission_id = p_mission_id;

  if v_progress.id is null or v_progress.current_screen_key is null then
    return; -- not started: no screen is authorised
  end if;

  /*
   * 4. Return only that screen, from the version this run is pinned to (D-17).
   *
   * If the saved position no longer exists in that version, fall back to the
   * first screen rather than stranding the child (Tech Spec §53). This is the
   * same guarantee resolveResumeScreen used to provide in the application,
   * moved here because the application can no longer see the screen list.
   */
  if not exists (
    select 1 from mission_screens s
    where s.mission_id = p_mission_id
      and s.version = v_progress.mission_version
      and s.screen_key = v_progress.current_screen_key
  ) then
    select s.screen_key into v_progress.current_screen_key
    from mission_screens s
    where s.mission_id = p_mission_id
      and s.version = v_progress.mission_version
    order by s.sequence asc
    limit 1;

    if v_progress.current_screen_key is null then
      return;
    end if;
  end if;

  return query
  select
    s.screen_key,
    s.type,
    s.title,
    s.body,
    s.sequence,
    s.configuration,
    (
      select n.screen_key
      from mission_screens n
      where n.mission_id = p_mission_id
        and n.version = v_progress.mission_version
        and n.sequence > s.sequence
      order by n.sequence asc
      limit 1
    ) as next_sequence_key
  from mission_screens s
  where s.mission_id = p_mission_id
    and s.version = v_progress.mission_version
    and s.screen_key = v_progress.current_screen_key;
end;
$$;

revoke all on function get_current_mission_screen(uuid, uuid) from public;
grant execute on function get_current_mission_screen(uuid, uuid) to authenticated;

-- --------------------------------------------- evidence shape correction ---
/*
 * 0001 assumed digital evidence always means a FILE. It does not.
 *
 * Architecture §15: digital evidence is "responses or artefacts genuinely
 * stored by the Academy" — and a saved response is genuinely stored, in
 * mission_responses. Six Names' Final Judgement is exactly that: private
 * digital evidence with no upload (Brief §6, §10).
 *
 * So digital evidence must be stored SOMEHOW — as a file or as text — while
 * physical evidence must still never pretend to have either.
 */
alter table mission_evidence
  drop constraint if exists digital_evidence_has_file;

alter table mission_evidence
  add constraint digital_evidence_is_stored
  check (
    type = 'physical'
    or storage_path is not null
    or description is not null
  );

-- Makes Trail creation idempotent: re-running completion cannot duplicate an
-- entry, which matters because complete_mission is itself idempotent.
create unique index if not exists mission_evidence_progress_title_key
  on mission_evidence (progress_id, title);

-- ------------------------------------------------- completion with Trail ---
/*
 * Completion now also writes Mission Trail evidence, in the same transaction.
 *
 * Brief §6: "Completion requires all required stages above; Mission Trail does
 * not require a digital upload." So entries are created from the mission's
 * completion configuration — physical entries record that an artefact belongs
 * to the Trail WITHOUT claiming to store it (Architecture §15, Brief §27),
 * and digital entries carry a saved response.
 *
 * Atomic with the status change: a child can never see "Complete" over a Trail
 * that was not written.
 */
create or replace function complete_mission(
  p_progress_id uuid,
  p_state       jsonb,
  p_trail       jsonb default '[]'::jsonb
)
returns mission_progress
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_progress mission_progress;
  v_entry    jsonb;
  v_body     text;
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

  -- Mission Trail entries, described by the mission's completion config.
  for v_entry in select * from jsonb_array_elements(coalesce(p_trail, '[]'::jsonb))
  loop
    v_body := null;

    -- A digital entry carries the child's own saved response.
    if v_entry->>'type' = 'digital' and v_entry->>'fromResponse' is not null then
      select r.value #>> '{}' into v_body
      from mission_responses r
      where r.progress_id = p_progress_id
        and r.screen_key = v_entry->>'fromResponse';
    end if;

    insert into mission_evidence (
      child_id, mission_id, progress_id, type, title, description, storage_path
    )
    values (
      v_progress.child_id,
      v_progress.mission_id,
      v_progress.id,
      (v_entry->>'type')::evidence_type,
      v_entry->>'title',
      coalesce(v_body, v_entry->>'description'),
      -- Physical evidence has no file, and must never pretend otherwise.
      null
    )
    on conflict (progress_id, title) do nothing;
  end loop;

  return v_progress;
end;
$$;
