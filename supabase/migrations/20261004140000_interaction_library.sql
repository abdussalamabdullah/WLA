-- ============================================================================
-- 0031 — The interaction library (Enhancement Plan §4, D-86)
-- ============================================================================
--
-- Fourteen screen types, each a reusable KIND of interaction configured per
-- mission (Tech Spec §62) — see src/features/mission-engine/interactions/.
-- Answers live in `outcomes` inside configuration; the projection never sends
-- them to the browser, and learner input is graded by the runtime on the
-- server (D-80), so nothing here grants a new client path.
--
-- validate_mission_version learns the library's ways between screens — an
-- outcome's `next` and onNoMatch's `next`/`fallbackNext` — so a screen that
-- routes only by outcome is not reported as a dead end, and a broken outcome
-- target is caught by the database gate as well as by the TS validator.
-- Same signature; create or replace.
--
-- The enum values are added and NOT used in this migration (an added value
-- cannot be used in the transaction that adds it).
-- ============================================================================

alter type screen_type add value if not exists 'numeric_entry';
alter type screen_type add value if not exists 'code_entry';
alter type screen_type add value if not exists 'token_sequence';
alter type screen_type add value if not exists 'arrange';
alter type screen_type add value if not exists 'matching';
alter type screen_type add value if not exists 'allocate';
alter type screen_type add value if not exists 'inventory';
alter type screen_type add value if not exists 'compare';
alter type screen_type add value if not exists 'hotspot';
alter type screen_type add value if not exists 'sketch';
alter type screen_type add value if not exists 'map';
alter type screen_type add value if not exists 'pattern_grid';
alter type screen_type add value if not exists 'simulation';
alter type screen_type add value if not exists 'workspace';

create or replace function validate_mission_version(
  p_mission_id uuid,
  p_version int
)
returns table (code text, blocking boolean, screen_key text, detail text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_delivery mission_delivery;
  v_definition jsonb;
begin
  if not is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  select m.delivery_type into v_delivery from missions m where m.id = p_mission_id;
  select mv.definition into v_definition from mission_versions mv
   where mv.mission_id = p_mission_id and mv.version = p_version;

  return query
  with screens as (
    select s.screen_key, s.type, s.sequence, s.configuration, s.title
    from mission_screens s
    where s.mission_id = p_mission_id and s.version = p_version
  ),
  edges as (
    select sc.screen_key as src, sc.configuration->>'next' as dst, 'next'::text as kind
    from screens sc where coalesce(sc.configuration->>'next', '') <> ''
    union all
    select sc.screen_key, sc.configuration->>'otherwise', 'otherwise'
    from screens sc where coalesce(sc.configuration->>'otherwise', '') <> ''
    union all
    select sc.screen_key, opt->>'next', 'option'
    from screens sc
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(sc.configuration->'options') = 'array'
           then sc.configuration->'options' else '[]'::jsonb end) opt
    where coalesce(opt->>'next', '') <> ''
    union all
    select sc.screen_key, r->>'to', 'route'
    from screens sc
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(sc.configuration->'routes') = 'array'
           then sc.configuration->'routes' else '[]'::jsonb end) r
    where coalesce(r->>'to', '') <> ''
    union all
    -- interaction library: graded outcomes and the no-match routes (0031)
    select sc.screen_key, o->>'next', 'outcome'
    from screens sc
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(sc.configuration->'outcomes') = 'array'
           then sc.configuration->'outcomes' else '[]'::jsonb end) o
    where coalesce(o->>'next', '') <> ''
    union all
    select sc.screen_key, sc.configuration->'onNoMatch'->>k, 'no_match'
    from screens sc
    cross join (values ('next'), ('fallbackNext')) as nm(k)
    where coalesce(sc.configuration->'onNoMatch'->>k, '') <> ''
  )
  select 'no_screens', true, null::text,
         'This version has no screens yet. Add at least one screen before publishing.'
  where not exists (select 1 from screens)
  union all
  select 'duplicate_sequence', true, null::text,
         'Two or more screens share position ' || sequence::text || '.'
  from screens group by sequence having count(*) > 1
  union all
  select 'broken_reference', true, e.src,
         'Goes to "' || e.dst || '", which is not a screen in this version.'
  from edges e
  where not exists (select 1 from screens s where s.screen_key = e.dst)
  union all
  select 'choice_without_options', true, s.screen_key,
         'This decision screen has no choices, so the mission cannot continue past it.'
  from screens s
  where s.type in ('choice', 'multi_choice')
    and jsonb_typeof(s.configuration->'options') is distinct from 'array'
  union all
  select 'dead_end', true, s.screen_key,
         'Nothing follows this screen, and it is not the completion screen.'
  from screens s
  where s.type not in ('completion')
    and not exists (select 1 from edges e where e.src = s.screen_key)
  union all
  select 'no_completion_screen', true, null::text,
         'This version has no completion screen, so a learner could never finish it.'
  where exists (select 1 from screens)
    and not exists (select 1 from screens where type = 'completion')
  union all
  select 'no_completion_rule', true, null::text,
         'This version has no completion rule, so the Academy cannot tell when it is finished.'
  where not exists (
    select 1 from mission_versions mv
    where mv.mission_id = p_mission_id and mv.version = p_version
      and mv.completion_rule is not null
      and mv.completion_rule <> 'null'::jsonb
  )
  and coalesce(v_definition ? 'completion', false) = false
  union all
  select 'no_kit_resources',
         v_delivery in ('physical', 'hybrid'),
         null::text,
         case when v_delivery in ('physical', 'hybrid')
           then 'This is a ' || v_delivery::text || ' mission, so it needs at least one Mission Kit resource.'
           else 'This version has no Mission Kit resources.'
         end
  where not exists (
    select 1 from mission_resources r
    where r.mission_id = p_mission_id and r.version = p_version
  )
  union all
  select 'kit_resource_without_file', true, null::text,
         'A Mission Kit resource has no file attached.'
  from mission_resources r
  where r.mission_id = p_mission_id and r.version = p_version
    and coalesce(trim(r.storage_path), '') = ''
  union all
  select 'no_parent_note', true, null::text,
         'This version has no note for parents. For Parents is always available, so it needs one.'
  where not exists (
    select 1 from mission_parent_notes n
    where n.mission_id = p_mission_id and n.version = p_version
      and coalesce(trim(n.content), '') <> ''
  );
end;
$$;
revoke all on function validate_mission_version(uuid, int) from public;
grant execute on function validate_mission_version(uuid, int) to authenticated;
