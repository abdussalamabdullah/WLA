-- ===========================================================================
-- MISSION VERSION LIFECYCLE (D-56, D-57)
--
-- The LMS brief allows an admin to author a mission without a developer, and
-- simultaneously forbids casual edits to live mission logic. Those two only
-- coexist if "editable" is a property of a VERSION rather than of a mission.
--
-- What already existed, and is deliberately left alone:
--   * mission_screens is already versioned  — unique (mission_id, version, screen_key)
--   * get_current_mission_screen already resolves s.version = progress.mission_version
--   * mission_progress already pins mission_version + completion_rule at start (D-17)
--
-- So version PINNING needed no change at all. What was missing was a status
-- per version, and a rule that stops a published structure being rewritten.
--
-- TWO DIFFERENT IDEAS, DELIBERATELY NOT MERGED
--
--   mission_versions.status  — the authoring lifecycle of one version's
--                              structure: draft → in_review → published →
--                              archived. Governs who may EDIT it.
--   missions.published       — whether the mission is offered in the public
--                              catalogue at all. Governs who may BUY it.
--
-- Six Names is the reason these must stay separate: its v2 structure is live
-- and must become immutable, while the mission itself must stay out of the
-- catalogue. Collapsing them into one flag would force a choice between
-- protecting the structure and honouring "do not publish Six Names".
-- ===========================================================================

create type mission_version_status as enum
  ('draft', 'in_review', 'published', 'archived');

create table if not exists mission_versions (
  id              uuid primary key default gen_random_uuid(),
  mission_id      uuid not null references missions(id) on delete cascade,
  version         int  not null,
  status          mission_version_status not null default 'draft',
  -- Snapshotted onto a run at start (D-17). Lives per version so that editing
  -- a draft's completion rule cannot change what "complete" means for anyone
  -- already playing an earlier one.
  completion_rule jsonb,
  -- Free-text authoring note. Never shown to a learner.
  notes           text,
  created_by      uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  published_at    timestamptz,
  archived_at     timestamptz,
  unique (mission_id, version)
);

create index if not exists mission_versions_mission_status_idx
  on mission_versions (mission_id, status);

-- ---------------------------------------------------------------- backfill --
-- One row per version that actually has screens, plus the mission's own
-- current version even when it has none yet.
insert into mission_versions (mission_id, version, status, completion_rule, created_at)
select
  s.mission_id,
  s.version,
  case
    -- The mission's current version carries the live structure. It becomes
    -- immutable. Note this is NOT missions.published — see the header.
    when s.version = m.version then 'published'::mission_version_status
    -- Anything older is history: still playable by runs pinned to it, never
    -- editable again.
    else 'archived'::mission_version_status
  end,
  case when s.version = m.version then m.completion_rule else null end,
  now()
from (select distinct mission_id, version from mission_screens) s
join missions m on m.id = s.mission_id
on conflict (mission_id, version) do nothing;

insert into mission_versions (mission_id, version, status, completion_rule, created_at)
select m.id, m.version, 'published'::mission_version_status, m.completion_rule, now()
from missions m
on conflict (mission_id, version) do nothing;

update mission_versions
   set published_at = coalesce(published_at, created_at)
 where status = 'published';
update mission_versions
   set archived_at = coalesce(archived_at, created_at)
 where status = 'archived';

-- ======================================================== IMMUTABILITY =====
/*
 * The rule the brief actually asks for: "Published versions are immutable."
 *
 * Enforced by a TRIGGER rather than by the editor, because the editor is not
 * the only way to reach this table. A direct PostgREST call, a future server
 * action, or a mistaken migration all pass through here. An earlier decision
 * in this codebase (D-54) was made for exactly this reason after a direct API
 * call mutated a mission's version.
 *
 * Applies to INSERT and DELETE as well as UPDATE: adding a screen to, or
 * removing one from, a published version rewrites its structure just as surely
 * as editing one.
 *
 * Deliberately NOT a `security definer` function and not owner-bypassed: it
 * fires for every role, including the service role and the table owner. A
 * migration that genuinely must repair a published version has to move it to
 * draft first, which leaves a trace.
 */
create or replace function guard_immutable_mission_version()
returns trigger
language plpgsql
as $$
declare
  v_mission uuid;
  v_version int;
  v_status  mission_version_status;
begin
  if tg_op = 'DELETE' then
    v_mission := old.mission_id; v_version := old.version;
  else
    v_mission := new.mission_id; v_version := new.version;
  end if;

  select mv.status into v_status
  from mission_versions mv
  where mv.mission_id = v_mission and mv.version = v_version;

  -- No lifecycle row yet: this is pre-existing seed content being loaded, or a
  -- version being created. The create path inserts the row first.
  if v_status is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_status in ('published', 'archived') then
    raise exception
      'mission version %.% is % and cannot be modified; create a new version instead',
      v_mission, v_version, v_status
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists mission_screens_immutable on mission_screens;
create trigger mission_screens_immutable
  before insert or update or delete on mission_screens
  for each row execute function guard_immutable_mission_version();

/*
 * A version's own row is nearly as structural as its screens: completion_rule
 * is snapshotted onto runs. Lock it once the version leaves draft/in_review,
 * allowing only the status transitions and their timestamps.
 */
create or replace function guard_mission_version_row()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('published', 'archived')
     and (new.completion_rule is distinct from old.completion_rule
          or new.version      is distinct from old.version
          or new.mission_id   is distinct from old.mission_id) then
    raise exception 'mission version %.% is % and its structure cannot be changed',
      old.mission_id, old.version, old.status using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mission_versions_guard on mission_versions;
create trigger mission_versions_guard
  before update on mission_versions
  for each row execute function guard_mission_version_row();

-- ===================================================== AUTHORING ACTIONS ===

/*
 * Create a new DRAFT version by deep-copying an existing one.
 *
 * This is the only sanctioned way to make a structural change to a mission
 * that is already live. Runs already in flight keep their pinned version and
 * are untouched by anything that happens to the copy (D-17).
 */
create or replace function create_mission_version(
  p_mission_id uuid,
  p_from_version int default null
)
returns mission_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from int;
  v_next int;
  v_row  mission_versions;
begin
  if not is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select coalesce(p_from_version, m.version) into v_from
  from missions m where m.id = p_mission_id;

  if v_from is null then
    raise exception 'mission_not_found' using errcode = 'P0002';
  end if;

  -- Never reuse a number: max over BOTH tables, so a draft that was deleted
  -- cannot have its number recycled onto pinned history.
  select greatest(
           coalesce((select max(version) from mission_versions where mission_id = p_mission_id), 0),
           coalesce((select max(version) from mission_screens  where mission_id = p_mission_id), 0),
           coalesce((select max(mission_version) from mission_progress where mission_id = p_mission_id), 0)
         ) + 1
    into v_next;

  insert into mission_versions (mission_id, version, status, completion_rule, created_by)
  select p_mission_id, v_next, 'draft',
         (select completion_rule from mission_versions
           where mission_id = p_mission_id and version = v_from),
         auth.uid()
  returning * into v_row;

  -- Deep copy. The trigger allows this because the new row is already 'draft'.
  insert into mission_screens
    (mission_id, screen_key, type, title, body, sequence, configuration, version)
  select mission_id, screen_key, type, title, body, sequence, configuration, v_next
  from mission_screens
  where mission_id = p_mission_id and version = v_from;

  return v_row;
end;
$$;

revoke all on function create_mission_version(uuid, int) from public;
grant execute on function create_mission_version(uuid, int) to authenticated;

/*
 * VALIDATION — brief §15.
 *
 * Returns one row per problem rather than raising, so the editor can show them
 * all at once. `blocking` separates "cannot publish" from "worth knowing".
 *
 * Runs entirely in SQL against the draft's own rows, so it validates what is
 * actually stored rather than what the form believes it submitted.
 */
create or replace function validate_mission_version(
  p_mission_id uuid,
  p_version int
)
returns table (code text, blocking boolean, screen_key text, detail text)
language plpgsql
security definer
set search_path = public
as $$
/*
 * RETURNS TABLE makes `code`, `blocking`, `screen_key` and `detail` plpgsql
 * variables as well as output columns, so a bare `screen_key` inside the query
 * below is ambiguous and Postgres refuses the whole function at runtime.
 * Resolve in favour of the column; the output columns are still assigned by
 * position from the RETURN QUERY.
 */
#variable_conflict use_column
begin
  if not is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  -- RECURSIVE because `reachable` walks the transition graph from the first
  -- screen. Orphan and unreachable-completion detection is exactly a
  -- reachability question, so it cannot be expressed without it.
  with recursive screens as (
    select s.screen_key, s.type, s.sequence, s.configuration, s.title
    from mission_screens s
    where s.mission_id = p_mission_id and s.version = p_version
  ),
  -- Every transition this version declares: a screen's own `next`, and each
  -- option's `next` on a choice screen.
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
  first_screen as (
    select screen_key from screens order by sequence asc limit 1
  ),
  -- Reachability from the first screen, following declared edges.
  reachable as (
    select screen_key from first_screen
    union
    select e.dst from edges e join reachable r on r.screen_key = e.src
    where e.dst is not null
  )
  -- 1. at least one screen
  select 'no_screens', true, null::text,
         'This version has no screens yet. Add at least one screen before publishing.'
  where not exists (select 1 from screens)

  union all
  -- 2. duplicate sequence numbers make the order ambiguous
  select 'duplicate_sequence', true, null::text,
         'Two or more screens share position ' || sequence::text || '.'
  from screens group by sequence having count(*) > 1

  union all
  -- 3. a transition points at a screen that does not exist
  select 'broken_reference', true, e.src,
         'Goes to "' || e.dst || '", which is not a screen in this version.'
  from edges e
  where not exists (select 1 from screens s where s.screen_key = e.dst)

  union all
  -- 4. a choice screen with no options is a dead end the learner cannot pass
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
  -- 5. a non-terminal screen that leads nowhere
  select 'dead_end', true, s.screen_key,
         'Nothing follows this screen, and it is not the completion screen.'
  from screens s
  where s.type not in ('completion')
    and coalesce(s.configuration->>'next', '') = ''
    and not exists (
      select 1 from edges e where e.src = s.screen_key
    )

  union all
  -- 6. orphans: present but unreachable from the first screen
  select 'unreachable_screen', true, s.screen_key,
         'No path from the first screen reaches this screen.'
  from screens s
  where s.screen_key not in (select screen_key from reachable)

  union all
  -- 7. completion must exist and be reachable
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
  -- 8. the completion rule must resolve
  select 'no_completion_rule', true, null::text,
         'This version has no completion rule, so the Academy cannot tell when it is finished.'
  where not exists (
    select 1 from mission_versions mv
    where mv.mission_id = p_mission_id and mv.version = p_version
      and mv.completion_rule is not null
      and mv.completion_rule <> 'null'::jsonb
  )

  union all
  -- 9. advisory: a mission with no Kit resources
  select 'no_kit_resources', false, null::text,
         'This mission has no Mission Kit resources.'
  where not exists (
    select 1 from mission_resources r where r.mission_id = p_mission_id
  )

  union all
  -- 10. advisory: no parent note
  select 'no_parent_note', false, null::text,
         'This mission has no note for parents.'
  where not exists (
    select 1 from mission_parent_notes n where n.mission_id = p_mission_id
  )

  union all
  -- 11. advisory: untitled screens are hard to work with in the editor
  select 'screen_without_title', false, s.screen_key,
         'This screen has no title.'
  from screens s
  where coalesce(s.title, '') = '' and s.type not in ('handoff', 'completion');
end;
$$;

revoke all on function validate_mission_version(uuid, int) from public;
grant execute on function validate_mission_version(uuid, int) to authenticated;

-- ------------------------------------------------------ status transitions --
create or replace function set_mission_version_status(
  p_mission_id uuid,
  p_version int,
  p_status mission_version_status
)
returns mission_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      mission_versions;
  v_current  mission_version_status;
  v_blocking int;
begin
  if not is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select status into v_current from mission_versions
  where mission_id = p_mission_id and version = p_version;

  if v_current is null then
    raise exception 'version_not_found' using errcode = 'P0002';
  end if;

  -- Legal transitions. Nothing returns from published or archived: that is
  -- what makes "immutable" mean something.
  if not (
       (v_current = 'draft'     and p_status in ('in_review', 'published'))
    or (v_current = 'in_review' and p_status in ('draft', 'published'))
    or (v_current = 'published' and p_status = 'archived')
  ) then
    raise exception 'illegal_transition_%_to_%', v_current, p_status
      using errcode = '42501';
  end if;

  if p_status = 'published' then
    select count(*) into v_blocking
    from validate_mission_version(p_mission_id, p_version) v
    where v.blocking;

    if v_blocking > 0 then
      raise exception 'validation_failed: % blocking problem(s)', v_blocking
        using errcode = '23514';
    end if;

    -- Exactly one published version per mission. The outgoing one is archived
    -- rather than deleted so that runs pinned to it keep working.
    update mission_versions
       set status = 'archived', archived_at = now()
     where mission_id = p_mission_id
       and status = 'published'
       and version <> p_version;

    update mission_versions
       set status = 'published', published_at = now()
     where mission_id = p_mission_id and version = p_version
    returning * into v_row;

    -- This is what makes NEW runs pick it up: start_mission reads
    -- missions.version. Existing runs keep their own pinned value.
    update missions
       set version = p_version,
           completion_rule = v_row.completion_rule,
           updated_at = now()
     where id = p_mission_id;

    return v_row;
  end if;

  update mission_versions
     set status = p_status,
         submitted_at = case when p_status = 'in_review' then now() else submitted_at end,
         archived_at  = case when p_status = 'archived'  then now() else archived_at  end
   where mission_id = p_mission_id and version = p_version
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function set_mission_version_status(uuid, int, mission_version_status) from public;
grant execute on function set_mission_version_status(uuid, int, mission_version_status) to authenticated;

-- ---------------------------------------------------------------- reading --
alter table mission_versions enable row level security;

create policy "admins read mission versions" on mission_versions
  for select using (is_admin());
create policy "admins write mission versions" on mission_versions
  for insert with check (is_admin());

/*
 * Screens for one DRAFT version, for the editor only.
 *
 * mission_screens still has no client read policy (D-52 and the screen_access
 * migration), and that must not change: it is what stops future screens,
 * unused branches and Evidence bodies reaching a learner's browser. This
 * function is the narrow, admin-only, draft-only exception the builder needs,
 * and it refuses on a published or archived version so it can never become a
 * way to read live mission content.
 */
create or replace function admin_draft_screens(p_mission_id uuid, p_version int)
returns table (
  id uuid, screen_key text, type screen_type, title text, body text,
  sequence int, configuration jsonb
)
language plpgsql
security definer
set search_path = public
as $$
/*
 * RETURNS TABLE turns each output column into a plpgsql variable too, so a
 * bare reference to a same-named table column is ambiguous and Postgres
 * refuses the statement at RUN time, not at CREATE time. Resolve in favour of
 * the column. Found by execution: verify_child_session compiled cleanly and
 * failed on first use.
 */
#variable_conflict use_column
declare v_status mission_version_status;
begin
  if not is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select mv.status into v_status from mission_versions mv
  where mv.mission_id = p_mission_id and mv.version = p_version;

  if v_status is null then
    raise exception 'version_not_found' using errcode = 'P0002';
  end if;

  /*
   * DRAFT ONLY, and this is the whole point of the function.
   *
   * Without this an administrator could read a PUBLISHED version's screens —
   * including the concealed Evidence body — which is precisely what D-52
   * closed after a live test found it. The first version of this function had
   * the rule in its comment and not in its code; the executed regression
   * caught it, a reading of the file did not.
   */
  if v_status not in ('draft', 'in_review') then
    raise exception 'version_not_editable' using errcode = '42501';
  end if;

  return query
  select s.id, s.screen_key, s.type, s.title, s.body, s.sequence, s.configuration
  from mission_screens s
  where s.mission_id = p_mission_id and s.version = p_version
  order by s.sequence asc;
end;
$$;

revoke all on function admin_draft_screens(uuid, int) from public;
grant execute on function admin_draft_screens(uuid, int) to authenticated;

create or replace function admin_mission_versions(p_mission_id uuid)
returns table (
  version int, status mission_version_status, completion_rule jsonb,
  screens bigint, runs bigint, complete bigint,
  created_at timestamptz, published_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
/*
 * RETURNS TABLE turns each output column into a plpgsql variable too, so a
 * bare reference to a same-named table column is ambiguous and Postgres
 * refuses the statement at RUN time, not at CREATE time. Resolve in favour of
 * the column. Found by execution: verify_child_session compiled cleanly and
 * failed on first use.
 */
#variable_conflict use_column
begin
  if not is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select mv.version, mv.status, mv.completion_rule,
         (select count(*) from mission_screens s
           where s.mission_id = mv.mission_id and s.version = mv.version),
         (select count(*) from mission_progress p
           where p.mission_id = mv.mission_id and p.mission_version = mv.version),
         (select count(*) from mission_progress p
           where p.mission_id = mv.mission_id and p.mission_version = mv.version
             and p.status = 'complete'),
         mv.created_at, mv.published_at
  from mission_versions mv
  where mv.mission_id = p_mission_id
  order by mv.version desc;
end;
$$;

revoke all on function admin_mission_versions(uuid) from public;
grant execute on function admin_mission_versions(uuid) to authenticated;
