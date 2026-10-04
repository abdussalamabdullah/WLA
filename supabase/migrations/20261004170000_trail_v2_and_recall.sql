-- ============================================================================
-- 0034 — Mission Trail v2 for the child session, and recall (F6)
-- ============================================================================
--
-- 1. child_session_trail returns the Evidence v2 fields (0027): when the
--    entry was made during the mission rather than at the end, and how it
--    relates to an earlier entry (revision_of, changed_plan_of, result_of,
--    later_judgement_of, after_of). Still the child's own rows only, derived
--    from the token inside the database. The return type changes, so the
--    function is dropped and recreated (same name, same arguments, same
--    grants).
-- 2. engine_load_run also returns the run's responses, so the projection can
--    recall the child's own earlier words on a later screen
--    ({{response.<screen>}}). Service role only, as before.
-- ============================================================================

drop function if exists child_session_trail(text, text);
create function child_session_trail(p_token text, p_mission_slug text)
returns table (
  id uuid, type evidence_type, title text, description text, created_at timestamptz,
  evidence_key text, related_to uuid, relation text, source text, screen_key text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare v_child uuid;
begin
  v_child := assume_child_actor(p_token);

  return query
  select ev.id, ev.type, ev.title, ev.description, ev.created_at,
         ev.evidence_key, ev.related_to, ev.relation, ev.source, ev.screen_key
  from mission_evidence ev
  join missions m on m.id = ev.mission_id
  where ev.child_id = v_child and m.slug = p_mission_slug
  order by ev.created_at asc;
end;
$$;
revoke all on function child_session_trail(text, text) from public;
grant execute on function child_session_trail(text, text) to anon, authenticated;

create or replace function engine_load_run(p_progress_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p  mission_progress;
  v_v  mission_versions;
  v_m  missions;
begin
  select * into v_p from mission_progress where id = p_progress_id;
  if not found then return null; end if;
  select * into v_m from missions where id = v_p.mission_id;
  select * into v_v from mission_versions
   where mission_id = v_p.mission_id and version = v_p.mission_version;

  return jsonb_build_object(
    'progress', to_jsonb(v_p),
    'state', coalesce((select state_data from mission_state where progress_id = v_p.id), '{}'::jsonb),
    'private', coalesce((select data from mission_state_private where progress_id = v_p.id), '{}'::jsonb),
    'definition', coalesce(v_v.definition, '{}'::jsonb),
    'completion_rule', coalesce(v_p.completion_rule, v_v.completion_rule, v_m.completion_rule),
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'screenKey', s.screen_key, 'type', s.type, 'title', s.title,
               'body', s.body, 'sequence', s.sequence, 'configuration', s.configuration)
             order by s.sequence)
      from mission_screens s
      where s.mission_id = v_p.mission_id and s.version = v_p.mission_version
    ), '[]'::jsonb),
    -- F6 recall (0034): this run's own responses, so a later screen can
    -- show the child what they said earlier. Server-side only, like the rest.
    'responses', coalesce((
      select jsonb_object_agg(r.screen_key, r.value)
      from mission_responses r
      where r.progress_id = v_p.id
    ), '{}'::jsonb)
  );
end;
$$;
revoke all on function engine_load_run(uuid) from public, anon, authenticated;
grant execute on function engine_load_run(uuid) to service_role;
