-- ============================================================================
-- 0033 — engine_save: analytics can never fail a learner's save (D-90)
-- ============================================================================
--
-- Found while taking the interaction library onto the real learner path: the
-- simulation contract emitted an event name the analytics allow-list does not
-- contain. engine_save inserted analytics in the same statement as nothing
-- else could refuse, so ONE unlisted name or detail key raised a
-- check_violation and rolled back the child's whole interaction — state,
-- response, Trail evidence and completion. Learner Preview never touches the
-- database, so preview QA could not see it.
--
-- D-50 already says reporting must never break a mission. This makes it true
-- by construction: each event is inserted in its own subtransaction, and a
-- refused event is dropped. The allow-lists themselves are unchanged (D-76).
-- Same signature; create or replace.
-- ============================================================================

create or replace function engine_save(
  p_progress_id    uuid,
  p_state          jsonb,
  p_private        jsonb,
  p_screen_key     text,
  p_response_key   text,
  p_response_value jsonb,
  p_complete       boolean,
  p_evidence       jsonb,
  p_events         jsonb
)
returns mission_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ev jsonb;
  v_p     mission_progress;
  v_e     jsonb;
  v_trail jsonb;
  v_body  text;
  v_rel   uuid;
begin
  select * into v_p from mission_progress where id = p_progress_id for update;
  if not found then
    raise exception 'run_not_found' using errcode = 'P0002';
  end if;
  -- Architecture §17: a completed run is terminal. Nothing rewrites it.
  if v_p.status = 'complete' then
    return v_p;
  end if;

  insert into mission_state (progress_id, state_data, updated_at)
  values (v_p.id, coalesce(p_state, '{}'::jsonb), now())
  on conflict (progress_id) do update
    set state_data = excluded.state_data, updated_at = now();

  insert into mission_state_private (progress_id, data, updated_at)
  values (v_p.id, coalesce(p_private, '{}'::jsonb), now())
  on conflict (progress_id) do update
    set data = excluded.data, updated_at = now();

  if p_response_key is not null then
    insert into mission_responses (progress_id, screen_key, value)
    values (v_p.id, p_response_key, coalesce(p_response_value, 'null'::jsonb))
    on conflict (progress_id, screen_key) do update
      set value = excluded.value, updated_at = now();
  end if;

  -- Mid-mission Mission Trail saves (F6). Keyed per run; a re-save of the
  -- same key updates it. Relations resolve by key within the same run.
  for v_e in select * from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    v_rel := null;
    if v_e->>'related_key' is not null then
      select id into v_rel from mission_evidence
       where progress_id = v_p.id and evidence_key = v_e->>'related_key';
    end if;
    insert into mission_evidence (
      child_id, mission_id, progress_id, type, title, description, storage_path,
      evidence_key, screen_key, related_to, relation, source)
    values (
      v_p.child_id, v_p.mission_id, v_p.id,
      (v_e->>'type')::evidence_type, v_e->>'title', v_e->>'description', null,
      v_e->>'key', v_e->>'screen_key', v_rel,
      case when v_rel is null then null else v_e->>'relation' end, 'mission')
    on conflict (progress_id, evidence_key) where evidence_key is not null do update
      set description = excluded.description, title = excluded.title;
  end loop;

  update mission_progress
  set current_screen_key = coalesce(p_screen_key, current_screen_key),
      last_activity_at   = now(),
      updated_at         = now(),
      status             = case when p_complete then 'complete'::mission_status else status end,
      completed_at       = case when p_complete then coalesce(completed_at, now()) else completed_at end
  where id = v_p.id
  returning * into v_p;

  if p_complete then
    -- Completion-screen Trail entries, exactly as complete_mission derives them.
    select s.configuration->'trailEntries' into v_trail
    from mission_screens s
    where s.mission_id = v_p.mission_id and s.version = v_p.mission_version
      and s.type = 'completion'
    order by s.sequence asc limit 1;

    for v_e in select * from jsonb_array_elements(coalesce(v_trail, '[]'::jsonb))
    loop
      v_body := null;
      if v_e->>'type' = 'digital' and v_e->>'fromResponse' is not null then
        select r.value #>> '{}' into v_body from mission_responses r
         where r.progress_id = v_p.id and r.screen_key = v_e->>'fromResponse';
        -- A digital entry with nothing to store is skipped, never fatal:
        -- completion must not be blocked by a Trail entry (Architecture §14).
        continue when v_body is null and v_e->>'description' is null;
      end if;
      insert into mission_evidence (
        child_id, mission_id, progress_id, type, title, description, storage_path, source)
      values (
        v_p.child_id, v_p.mission_id, v_p.id, (v_e->>'type')::evidence_type,
        v_e->>'title', coalesce(v_body, v_e->>'description'), null, 'completion')
      on conflict (progress_id, title) do nothing;
    end loop;
  end if;

  -- Analytics (F5, D-76): structural events only, keyed to the run, not the child.
  -- Reporting must never break a mission (D-50, D-90): each event is written
  -- in its own subtransaction, and one the allow-lists refuse is dropped —
  -- never the learner's state, response, evidence or completion above.
  for v_ev in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    begin
      insert into analytics_events (name, mission_id, mission_version, run_key, screen_key, detail)
      values (v_ev->>'name', v_p.mission_id, v_p.mission_version, v_p.analytics_key,
              v_ev->>'screen_key', coalesce(v_ev->'detail', '{}'::jsonb));
    exception when check_violation or not_null_violation then
      null;
    end;
  end loop;

  return v_p;
end;
$$;
revoke all on function engine_save(uuid, jsonb, jsonb, text, text, jsonb, boolean, jsonb, jsonb) from public, anon, authenticated;
grant execute on function engine_save(uuid, jsonb, jsonb, text, text, jsonb, boolean, jsonb, jsonb) to service_role;
