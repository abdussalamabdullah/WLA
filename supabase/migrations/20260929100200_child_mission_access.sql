-- ===========================================================================
-- CHILD-SESSION MISSION ACCESS (D-59)
--
-- The child experience needs exactly what the parent experience needs — start,
-- resume, persist, complete, trail — but the actor is a child session rather
-- than a Supabase user, so `auth.uid()` is null and RLS on mission_progress
-- (keyed on the parent) denies everything.
--
-- THE CHOICE MADE HERE, AND WHY
--
-- Duplicating start_mission / persist_mission_state / complete_mission for
-- children would be the obvious move and the wrong one: three intricate
-- functions carrying D-17 pinning, first-screen fallback and Trail derivation
-- would immediately start to diverge, and the child copy would rot silently
-- because Six Names is exercised through the parent path.
--
-- Instead there is ONE seam. `owns_child()` — already the single ownership
-- predicate the persistence functions consult — additionally accepts a
-- transaction-local actor GUC. Only the `security definer` wrappers below set
-- it, and only after verify_child_session has authenticated the token inside
-- the database.
--
-- WHY THIS IS NOT A BACK DOOR
--   * `set_config(..., true)` is TRANSACTION-local. It cannot outlive the
--     statement that set it, so it cannot leak between requests or sessions.
--   * A client cannot set it. PostgREST exposes only functions in the exposed
--     schema; `set_config` lives in pg_catalog and is not callable over the
--     API, and none of the exposed functions take a GUC name.
--   * It is only ever set to a child id that the database itself just derived
--     from a token it verified. It is never taken from a request parameter.
--   * A test asserts that an anon caller who supplies a forged child id gets
--     nothing, and that the GUC is empty at the start of every request.
-- ===========================================================================

-- Parameter name must stay `target_child`: Postgres refuses to rename an
-- input parameter through CREATE OR REPLACE.
create or replace function owns_child(target_child uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- the parent path, unchanged
    exists (
      select 1 from child_profiles c
      where c.id = target_child and c.parent_id = auth.uid()
    )
    -- the child-session path: set only by a verified child session, and only
    -- for the duration of one transaction.
    or coalesce(current_setting('app.child_actor', true), '') = target_child::text;
$$;

/*
 * The progress-level predicate needs the same seam, for the same reason:
 * persist_mission_state and complete_mission consult it, and a child session
 * legitimately owns its own progress rows.
 */
create or replace function owns_progress(target_progress uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from mission_progress p
    join child_profiles c on c.id = p.child_id
    where p.id = target_progress
      and (
        c.parent_id = auth.uid()
        or coalesce(current_setting('app.child_actor', true), '') = c.id::text
      )
  );
$$;

/*
 * get_current_mission_screen re-stated so that ownership goes through
 * owns_child() rather than an inline auth.uid() test.
 *
 * The screen-selection logic below is UNCHANGED from
 * 20260927100100_withhold_unused_next_key.sql — including the D-42 rule that
 * withholds next_sequence_key whenever the screen or its options name their
 * own destination. It is re-stated rather than wrapped because the ownership
 * test sits at the top of the same function body; if this logic changes again,
 * this is the definition that must change with it.
 */
create or replace function get_current_mission_screen(p_child_id uuid, p_mission_id uuid)
returns table (
  screen_key text, type screen_type, title text, body text,
  sequence int, configuration jsonb, next_sequence_key text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare v_progress mission_progress;
begin
  -- 1. the actor must own the child: a parent by auth.uid(), or the child
  --    themselves by a verified session.
  if not owns_child(p_child_id) then
    raise exception 'not_your_child';
  end if;

  -- 2. the child must be entitled to the mission
  if not exists (
    select 1 from mission_entitlements e
    where e.child_id = p_child_id and e.mission_id = p_mission_id
      and e.status = 'active'
  ) then
    raise exception 'not_entitled';
  end if;

  -- 3. the child must have started it
  select * into v_progress from mission_progress
  where child_id = p_child_id and mission_id = p_mission_id;

  if v_progress.id is null or v_progress.current_screen_key is null then
    return;
  end if;

  -- 4. fall back to the first screen if the saved position no longer exists
  --    in this run's pinned version (Tech Spec §53).
  if not exists (
    select 1 from mission_screens s
    where s.mission_id = p_mission_id
      and s.version = v_progress.mission_version
      and s.screen_key = v_progress.current_screen_key
  ) then
    select s.screen_key into v_progress.current_screen_key
    from mission_screens s
    where s.mission_id = p_mission_id and s.version = v_progress.mission_version
    order by s.sequence asc limit 1;
    if v_progress.current_screen_key is null then return; end if;
  end if;

  return query
  select s.screen_key, s.type, s.title, s.body, s.sequence, s.configuration,
    case
      when s.configuration ? 'next' then null
      when s.type = 'choice'
       and s.configuration ? 'options'
       and jsonb_array_length(s.configuration -> 'options') > 0
       and not exists (
         select 1 from jsonb_array_elements(s.configuration -> 'options') o
         where not (o ? 'next')
       ) then null
      else (
        select n.screen_key from mission_screens n
        where n.mission_id = p_mission_id
          and n.version = v_progress.mission_version
          and n.sequence > s.sequence
        order by n.sequence asc limit 1
      )
    end as next_sequence_key
  from mission_screens s
  where s.mission_id = p_mission_id
    and s.version = v_progress.mission_version
    and s.screen_key = v_progress.current_screen_key;
end;
$$;

revoke all on function get_current_mission_screen(uuid, uuid) from public;
grant execute on function get_current_mission_screen(uuid, uuid) to authenticated;

/*
 * Establish the child actor for this transaction from a session token.
 * Returns the child id, or raises. Every wrapper below starts with this.
 */
create or replace function assume_child_actor(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_child uuid;
begin
  select v.child_id into v_child from verify_child_session(p_token) v;
  if v_child is null then
    raise exception 'no_child_session' using errcode = '42501';
  end if;
  perform set_config('app.child_actor', v_child::text, true);
  return v_child;
end;
$$;
revoke all on function assume_child_actor(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- wrappers --
create or replace function child_session_start_mission(p_token text, p_mission_id uuid)
returns mission_progress
language plpgsql
security definer
set search_path = public
as $$
declare v_child uuid;
begin
  v_child := assume_child_actor(p_token);
  return start_mission(v_child, p_mission_id);
end;
$$;
revoke all on function child_session_start_mission(text, uuid) from public;
grant execute on function child_session_start_mission(text, uuid) to anon, authenticated;

create or replace function child_session_current_screen(p_token text, p_mission_id uuid)
returns table (
  screen_key text, type screen_type, title text, body text,
  sequence int, configuration jsonb, next_sequence_key text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare v_child uuid;
begin
  v_child := assume_child_actor(p_token);
  return query select * from get_current_mission_screen(v_child, p_mission_id);
end;
$$;
revoke all on function child_session_current_screen(text, uuid) from public;
grant execute on function child_session_current_screen(text, uuid) to anon, authenticated;

/*
 * Persist. The progress id is re-scoped to the session's child HERE, before
 * anything is written — holding a progress id is not authorisation, exactly as
 * the parent chain's requireOwnedProgress asserts.
 */
create or replace function child_session_persist_state(
  p_token text, p_progress_id uuid, p_state jsonb,
  p_screen_key text default null,
  p_response_key text default null,
  p_response_value jsonb default null
)
returns mission_progress
language plpgsql
security definer
set search_path = public
as $$
declare v_child uuid;
begin
  v_child := assume_child_actor(p_token);

  if not exists (
    select 1 from mission_progress p
    where p.id = p_progress_id and p.child_id = v_child
  ) then
    raise exception 'not_this_childs_record' using errcode = '42501';
  end if;

  return persist_mission_state(
    p_progress_id, p_state, p_screen_key, p_response_key, p_response_value);
end;
$$;
revoke all on function child_session_persist_state(text, uuid, jsonb, text, text, jsonb) from public;
grant execute on function child_session_persist_state(text, uuid, jsonb, text, text, jsonb) to anon, authenticated;

create or replace function child_session_complete_mission(
  p_token text, p_progress_id uuid, p_state jsonb, p_trail jsonb default '[]'::jsonb
)
returns mission_progress
language plpgsql
security definer
set search_path = public
as $$
declare v_child uuid;
begin
  v_child := assume_child_actor(p_token);

  if not exists (
    select 1 from mission_progress p
    where p.id = p_progress_id and p.child_id = v_child
  ) then
    raise exception 'not_this_childs_record' using errcode = '42501';
  end if;

  return complete_mission(p_progress_id, p_state, p_trail);
end;
$$;
revoke all on function child_session_complete_mission(text, uuid, jsonb, jsonb) from public;
grant execute on function child_session_complete_mission(text, uuid, jsonb, jsonb) to anon, authenticated;

-- One mission's home data for a child session.
create or replace function child_session_mission(p_token text, p_mission_slug text)
returns table (
  mission_id uuid, slug text, title text, description text, lab wla_lab,
  min_age int, max_age int, duration text, delivery_type mission_delivery,
  cover_image text, status mission_status, mission_version int,
  progress_id uuid, current_screen_key text,
  -- D-17: the rule PINNED ON THE RUN, never the mission's current one.
  -- Without it the engine has no rule to evaluate for a child session and
  -- completion can never be reached, which is silent: the mission simply
  -- never ends.
  completion_rule jsonb
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
  select m.id, m.slug, m.title, m.description, m.lab, m.min_age, m.max_age,
         m.duration, m.delivery_type, m.cover_image,
         coalesce(p.status, 'not_started'::mission_status),
         p.mission_version, p.id, p.current_screen_key, p.completion_rule
  from mission_entitlements e
  join missions m on m.id = e.mission_id
  left join mission_progress p on p.mission_id = m.id and p.child_id = v_child
  where e.child_id = v_child and e.status = 'active' and m.slug = p_mission_slug;
end;
$$;
revoke all on function child_session_mission(text, text) from public;
grant execute on function child_session_mission(text, text) to anon, authenticated;

-- The child's own Mission Trail.
create or replace function child_session_trail(p_token text, p_mission_slug text)
returns table (id uuid, type evidence_type, title text, description text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare v_child uuid;
begin
  v_child := assume_child_actor(p_token);

  return query
  select ev.id, ev.type, ev.title, ev.description, ev.created_at
  from mission_evidence ev
  join missions m on m.id = ev.mission_id
  where ev.child_id = v_child and m.slug = p_mission_slug
  order by ev.created_at asc;
end;
$$;
revoke all on function child_session_trail(text, text) from public;
grant execute on function child_session_trail(text, text) to anon, authenticated;

-- The Mission Kit a child may see. Mirrors the parent's resource read.
create or replace function child_session_resources(p_token text, p_mission_slug text)
returns table (
  id uuid, title text, description text, type resource_type,
  storage_path text, can_view boolean, can_print boolean, can_download boolean,
  sort_order int
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
  select r.id, r.title, r.description, r.type, r.storage_path,
         r.can_view, r.can_print, r.can_download, r.sort_order
  from mission_resources r
  join missions m on m.id = r.mission_id
  join mission_entitlements e
    on e.mission_id = m.id and e.child_id = v_child and e.status = 'active'
  where m.slug = p_mission_slug
  order by r.sort_order asc;
end;
$$;
revoke all on function child_session_resources(text, text) from public;
grant execute on function child_session_resources(text, text) to anon, authenticated;

/*
 * The child's saved mission state.
 *
 * Kept separate from child_session_current_screen rather than folded into it:
 * the screen comes from the gated RPC (which must stay the single path to
 * screen content), while state is the child's own progress data. Merging them
 * would put screen retrieval behind a function that also returns state, and
 * the gating rule is easier to keep true when it has exactly one entry point.
 */
create or replace function child_session_state(p_token text, p_progress_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child uuid;
  v_state jsonb;
begin
  v_child := assume_child_actor(p_token);

  -- The progress id is re-scoped to the session's child before it is used.
  if not exists (
    select 1 from mission_progress p
    where p.id = p_progress_id and p.child_id = v_child
  ) then
    raise exception 'not_this_childs_record' using errcode = '42501';
  end if;

  select s.state_data into v_state from mission_state s
   where s.progress_id = p_progress_id;

  return coalesce(v_state, '{}'::jsonb);
end;
$$;
revoke all on function child_session_state(text, uuid) from public;
grant execute on function child_session_state(text, uuid) to anon, authenticated;

/*
 * record_mission_event re-stated so ownership goes through owns_child().
 *
 * It inlined `c.parent_id = auth.uid()`, the same pattern
 * get_current_mission_screen had, so a child session could play a mission but
 * would emit no analytics — the admin dashboard's Started/Completed columns
 * would have silently undercounted every child-driven run while In progress
 * counted it. The body below is otherwise unchanged, including the rule that
 * the child id is an authorisation input and never a stored dimension.
 */
create or replace function record_mission_event(
  p_child_id   uuid,
  p_mission_id uuid,
  p_name       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version int;
begin
  if p_name not in ('mission_started', 'mission_completed') then
    raise exception 'unknown_event';
  end if;

  if not owns_child(p_child_id) then
    raise exception 'not_your_child';
  end if;

  if not exists (
    select 1 from mission_entitlements e
    where e.child_id = p_child_id
      and e.mission_id = p_mission_id
      and e.status = 'active'
  ) then
    raise exception 'not_entitled';
  end if;

  select mp.mission_version into v_version
  from mission_progress mp
  where mp.child_id = p_child_id and mp.mission_id = p_mission_id;

  if v_version is null then
    raise exception 'not_started';
  end if;

  insert into analytics_events (name, mission_id, mission_version)
  values (p_name, p_mission_id, v_version);
end;
$$;

revoke all on function record_mission_event(uuid, uuid, text) from public;
grant execute on function record_mission_event(uuid, uuid, text) to authenticated;

create or replace function child_session_record_event(
  p_token text, p_mission_id uuid, p_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_child uuid;
begin
  v_child := assume_child_actor(p_token);
  perform record_mission_event(v_child, p_mission_id, p_name);
end;
$$;
revoke all on function child_session_record_event(text, uuid, text) from public;
grant execute on function child_session_record_event(text, uuid, text) to anon, authenticated;
