-- ============================================================================
-- Fix: Mission Trail entries were never created.
--
-- FOUND BY HOSTED VALIDATION — completion succeeded, mission_evidence stayed
-- empty.
--
-- THE DEFECT
-- Trail entries are authored on the mission's `completion` screen, in
-- configuration.trailEntries. The application read them from the screen it was
-- currently rendering:
--
--     const completionScreenConfig =
--       screen?.type === "completion" ? screen.configuration : null;
--
-- But completion is EVALUATED after an interaction, and for Six Names the
-- final interaction is the response on `final_judgement`. At that moment the
-- current screen is of type `response`, never `completion` — the completion
-- screen is a configuration carrier that is never itself rendered. So the
-- lookup always produced null, extractTrailEntries always returned [], and
-- complete_mission received an empty array.
--
-- Result: a child completed the mission and their Mission Trail was empty.
-- TRAIL-01 was silently unmet. No behavioural test caught it because every
-- test passed trailEntries in explicitly.
--
-- THE FIX
-- Resolve the entries where the data actually lives — inside the function,
-- from the mission's own completion screen, at the pinned version (D-17).
-- `p_trail` is kept as an explicit override so existing callers and tests are
-- unaffected; when it is empty or null, the entries are derived.
--
-- This requires reading mission_screens, which has no client read policy, so
-- the function becomes SECURITY DEFINER — consistent with D-36 and with
-- start_mission and get_current_mission_screen. Its ownership check is
-- unchanged and still runs first.
--
-- The signature is identical, so CREATE OR REPLACE genuinely replaces the
-- function. It does NOT create a second overload — that mistake is what the
-- drop_stale_complete_mission migration exists to clean up.
-- ============================================================================

create or replace function complete_mission(
  p_progress_id uuid,
  p_state       jsonb,
  p_trail       jsonb default '[]'::jsonb
)
returns mission_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress mission_progress;
  v_trail    jsonb;
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

  /*
   * Trail entries: an explicit p_trail wins; otherwise derive them from this
   * mission's completion screen, at the version this run is pinned to.
   */
  v_trail := nullif(coalesce(p_trail, '[]'::jsonb), '[]'::jsonb);

  if v_trail is null then
    select s.configuration->'trailEntries' into v_trail
    from mission_screens s
    where s.mission_id = v_progress.mission_id
      and s.version    = v_progress.mission_version
      and s.type       = 'completion'
    order by s.sequence asc
    limit 1;
  end if;

  for v_entry in select * from jsonb_array_elements(coalesce(v_trail, '[]'::jsonb))
  loop
    v_body := null;

    -- A digital entry carries the child's own saved response.
    if v_entry->>'type' = 'digital' and v_entry->>'fromResponse' is not null then
      select r.value #>> '{}' into v_body
      from mission_responses r
      where r.progress_id = p_progress_id
        and r.screen_key  = v_entry->>'fromResponse';
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

revoke all on function complete_mission(uuid, jsonb, jsonb) from public;
grant execute on function complete_mission(uuid, jsonb, jsonb) to authenticated;
