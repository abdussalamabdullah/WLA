-- ===========================================================================
-- PUBLISH VALIDATION COVERS THE KIT AND THE PARENT NOTE (D-63)
--
-- Two changes, one of them a defect fix.
--
-- 1. THE EXISTING CHECKS WERE NOT VERSION-SCOPED. They asked whether the
--    MISSION had any resource or note at all, which after D-63 is true for a
--    draft whose own Kit is empty — an older version's rows satisfied it. A
--    draft could therefore publish with no printables while the validator said
--    nothing.
--
-- 2. THEY BECOME BLOCKING WHERE THE MISSION ACTUALLY NEEDS THEM.
--    A physical or hybrid mission without a Kit cannot be done: the child is
--    meant to be holding something. A digital mission legitimately has none,
--    so there the Kit stays advisory. The parent note is blocking for every
--    mission because Architecture §8 makes For Parents a permanent surface.
-- ===========================================================================

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
begin
  if not is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select m.delivery_type into v_delivery from missions m where m.id = p_mission_id;

  return query
  with recursive screens as (
    select s.screen_key, s.type, s.sequence, s.configuration, s.title
    from mission_screens s
    where s.mission_id = p_mission_id and s.version = p_version
  ),
  edges as (
    select sc.screen_key as src, sc.configuration->>'next' as dst, 'next'::text as kind
    from screens sc
    where coalesce(sc.configuration->>'next', '') <> ''
    union all
    select sc.screen_key, opt->>'next', 'option'
    from screens sc
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(sc.configuration->'options') = 'array'
           then sc.configuration->'options' else '[]'::jsonb end) opt
    where coalesce(opt->>'next', '') <> ''
  ),
  first_screen as (select screen_key from screens order by sequence asc limit 1),
  reachable as (
    select screen_key from first_screen
    union
    select e.dst from edges e join reachable r on r.screen_key = e.src
    where e.dst is not null
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
  select 'choice_option_without_target', true, s.screen_key,
         'A choice on this screen does not say which screen it leads to.'
  from screens s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.configuration->'options') = 'array'
         then s.configuration->'options' else '[]'::jsonb end) opt
  where s.type in ('choice', 'multi_choice')
    and coalesce(opt->>'next', '') = ''

  union all
  select 'dead_end', true, s.screen_key,
         'Nothing follows this screen, and it is not the completion screen.'
  from screens s
  where s.type not in ('completion')
    and coalesce(s.configuration->>'next', '') = ''
    and not exists (select 1 from edges e where e.src = s.screen_key)

  union all
  select 'unreachable_screen', true, s.screen_key,
         'No path from the first screen reaches this screen.'
  from screens s
  where s.screen_key not in (select screen_key from reachable)

  union all
  select 'no_completion_screen', true, null::text,
         'This version has no completion screen, so a learner could never finish it.'
  where exists (select 1 from screens)
    and not exists (select 1 from screens where type = 'completion')

  union all
  select 'unreachable_completion', true, s.screen_key,
         'The completion screen cannot be reached from the first screen.'
  from screens s
  where s.type = 'completion'
    and s.screen_key not in (select screen_key from reachable)

  union all
  select 'no_completion_rule', true, null::text,
         'This version has no completion rule, so the Academy cannot tell when it is finished.'
  where not exists (
    select 1 from mission_versions mv
    where mv.mission_id = p_mission_id and mv.version = p_version
      and mv.completion_rule is not null
      and mv.completion_rule <> 'null'::jsonb
  )

  -- ---------------------------------------------- Mission Kit (version-scoped)
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

  -- --------------------------------------------- Parent note (version-scoped)
  union all
  select 'no_parent_note', true, null::text,
         'This version has no note for parents. For Parents is always available, so it needs one.'
  where not exists (
    select 1 from mission_parent_notes n
    where n.mission_id = p_mission_id and n.version = p_version
      and coalesce(trim(n.content), '') <> ''
  )

  union all
  select 'screen_without_title', false, s.screen_key,
         'This screen has no title.'
  from screens s
  where coalesce(s.title, '') = '' and s.type not in ('handoff', 'completion');
end;
$$;

revoke all on function validate_mission_version(uuid, int) from public;
grant execute on function validate_mission_version(uuid, int) to authenticated;
