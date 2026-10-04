-- ============================================================================
-- 0027 — Engine foundation: server-authoritative state, mission definition,
--        private run state, evidence v2 and analytics v2 storage
--        (D-80, D-81, D-82; docs/FOUNDATION-ARCHITECTURE.md)
-- ============================================================================
--
-- 1. SERVER-AUTHORITATIVE STATE (D-80) — a security fix found while designing
--    the foundation. `authenticated` held table-level INSERT/UPDATE/DELETE on
--    mission_progress, mission_state, mission_responses and mission_evidence,
--    with family write policies, and `persist_mission_state` /
--    `complete_mission` (and their child-session twins) were executable by
--    clients and took the whole state and target screen as parameters. A
--    parent — or anyone holding a child's session cookie — could PATCH
--    `current_screen_key` to Six Names' Evidence or to the unused consequence,
--    or call complete_mission directly. The TypeScript engine's checks were
--    only advisory.
--
--    Now: clients keep SELECT on their own rows and lose every write. All
--    writes go through `engine_save`, executable by service_role only, called
--    by the Next server after the permission chain (parent) or the
--    token-derived lookup (child) has authorised the run and the shared engine
--    has computed the transition.
--
-- 2. PRIVATE RUN STATE — hidden variables, the randomisation seed and pool
--    draws must not be readable by the family (mission_state is). They live in
--    mission_state_private, which has RLS on and no client grants at all.
--
-- 3. MISSION DEFINITION (F8) — mission-level configuration (variables,
--    unlocks, events, variants, pools, checkpoints, timers) on the version.
--    Immutable once published, copied by create_mission_version, and readable
--    only through draft-only admin RPCs (D-61 preserved) or by the engine.
--
-- 4. EVIDENCE v2 (F6) and ANALYTICS v2 (F5, D-76) columns, written only by
--    engine_save in the same transaction as the state they describe.
-- ============================================================================

-- ------------------------------------------------- 1. close client writes --
drop policy if exists "family writes own state"     on mission_state;
drop policy if exists "family updates own state"    on mission_state;
drop policy if exists "family writes own progress"  on mission_progress;
drop policy if exists "family updates own progress" on mission_progress;
drop policy if exists "family writes own responses" on mission_responses;
drop policy if exists "family updates own responses" on mission_responses;
drop policy if exists "family writes own evidence"  on mission_evidence;

revoke insert, update, delete, truncate
  on mission_state, mission_progress, mission_responses, mission_evidence
  from anon, authenticated;

-- The legacy write paths stay in the database (migration history is
-- append-only) but no client can reach them.
revoke execute on function persist_mission_state(uuid, jsonb, text, text, jsonb) from public, anon, authenticated;
revoke execute on function complete_mission(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function child_session_persist_state(text, uuid, jsonb, text, text, jsonb) from public, anon, authenticated;
revoke execute on function child_session_complete_mission(text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function record_mission_event(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function child_session_record_event(text, uuid, text) from public, anon, authenticated;

-- ------------------------------------------------ 2. private run state ----
create table if not exists mission_state_private (
  progress_id uuid primary key references mission_progress(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table mission_state_private enable row level security;
revoke all on mission_state_private from public, anon, authenticated;
grant select, insert, update, delete on mission_state_private to service_role;

-- ------------------------------------------------------ analytics key ----
-- A random per-run key: lets reporting sequence one run's events without
-- knowing whose run it is (D-76). Nulled on events when the run is deleted.
alter table mission_progress
  add column if not exists analytics_key uuid not null default gen_random_uuid();
create unique index if not exists mission_progress_analytics_key_idx
  on mission_progress (analytics_key);

-- ------------------------------------------------- 3. mission definition --
alter table mission_versions
  add column if not exists definition jsonb not null default '{}'::jsonb;

-- Clients and admins read version metadata by column, never the definition.
revoke select on mission_versions from anon, authenticated;
grant select (id, mission_id, version, status, completion_rule, notes,
              created_by, created_at, updated_at, submitted_at, published_at,
              archived_at)
  on mission_versions to authenticated;

create or replace function guard_mission_version_row()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('published', 'archived')
     and (new.completion_rule is distinct from old.completion_rule
          or new.definition   is distinct from old.definition
          or new.version      is distinct from old.version
          or new.mission_id   is distinct from old.mission_id) then
    raise exception 'mission version %.% is % and its structure cannot be changed',
      old.mission_id, old.version, old.status using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Same signature as 0026's — create or replace, no overload (the 0008 lesson).
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

  if p_from_version is not null and not exists (
    select 1 from mission_versions
    where mission_id = p_mission_id and version = p_from_version
  ) then
    raise exception 'version_not_found' using errcode = 'P0002';
  end if;

  select greatest(
           coalesce((select max(version) from mission_versions where mission_id = p_mission_id), 0),
           coalesce((select max(version) from mission_screens  where mission_id = p_mission_id), 0),
           coalesce((select max(version) from mission_resources where mission_id = p_mission_id), 0),
           coalesce((select max(mission_version) from mission_progress where mission_id = p_mission_id), 0)
         ) + 1
    into v_next;

  insert into mission_versions (mission_id, version, status, completion_rule, definition, created_by)
  select p_mission_id, v_next, 'draft',
         (select completion_rule from mission_versions
           where mission_id = p_mission_id and version = v_from),
         coalesce((select definition from mission_versions
           where mission_id = p_mission_id and version = v_from), '{}'::jsonb),
         auth.uid()
  returning * into v_row;

  insert into mission_screens
    (mission_id, screen_key, type, title, body, sequence, configuration, version)
  select mission_id, screen_key, type, title, body, sequence, configuration, v_next
  from mission_screens
  where mission_id = p_mission_id and version = v_from;

  insert into mission_resources
    (mission_id, version, title, description, type, storage_path,
     can_view, can_print, can_download, sort_order)
  select mission_id, v_next, title, description, type, storage_path,
         can_view, can_print, can_download, sort_order
  from mission_resources
  where mission_id = p_mission_id and version = v_from;

  insert into mission_parent_notes (mission_id, version, content, document_path)
  select mission_id, v_next, content, document_path
  from mission_parent_notes
  where mission_id = p_mission_id and version = v_from;

  return v_row;
end;
$$;
revoke all on function create_mission_version(uuid, int) from public;
grant execute on function create_mission_version(uuid, int) to authenticated;

-- Draft-only read and write of the definition (D-61: no read path to
-- published content through authoring).
create or replace function admin_draft_definition(p_mission_id uuid, p_version int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_editable_version(p_mission_id, p_version);
  return (select definition from mission_versions
          where mission_id = p_mission_id and version = p_version);
end;
$$;
revoke all on function admin_draft_definition(uuid, int) from public;
grant execute on function admin_draft_definition(uuid, int) to authenticated;

create or replace function admin_set_definition(p_mission_id uuid, p_version int, p_definition jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_editable_version(p_mission_id, p_version);
  if jsonb_typeof(p_definition) is distinct from 'object' then
    raise exception 'definition_must_be_object' using errcode = '22023';
  end if;
  update mission_versions set definition = p_definition
  where mission_id = p_mission_id and version = p_version;
end;
$$;
revoke all on function admin_set_definition(uuid, int, jsonb) from public;
grant execute on function admin_set_definition(uuid, int, jsonb) to authenticated;

-- ---------------------------------------------------- 4a. evidence v2 -----
alter table mission_evidence
  add column if not exists evidence_key text,
  add column if not exists screen_key   text,
  add column if not exists related_to   uuid references mission_evidence(id) on delete set null,
  add column if not exists relation     text,
  add column if not exists source       text not null default 'completion';

alter table mission_evidence drop constraint if exists mission_evidence_relation_check;
alter table mission_evidence add constraint mission_evidence_relation_check
  check (relation is null or relation in
    ('revision_of', 'changed_plan_of', 'result_of', 'later_judgement_of', 'after_of'));
alter table mission_evidence drop constraint if exists mission_evidence_source_check;
alter table mission_evidence add constraint mission_evidence_source_check
  check (source in ('completion', 'mission'));
create unique index if not exists mission_evidence_progress_key_idx
  on mission_evidence (progress_id, evidence_key) where evidence_key is not null;

-- --------------------------------------------------- 4b. analytics v2 -----
alter table analytics_events
  add column if not exists run_key    uuid references mission_progress(analytics_key) on delete set null,
  add column if not exists screen_key text,
  add column if not exists detail     jsonb not null default '{}'::jsonb;

alter table analytics_events drop constraint if exists analytics_events_name_check;
alter table analytics_events add constraint analytics_events_name_check check (name in (
  'mission_started', 'mission_completed', 'screen_entered', 'session_resumed',
  'interaction_submitted', 'interaction_retry', 'validation_failed',
  'branch_chosen', 'variant_assigned', 'event_fired', 'reveal_opened',
  'unlock_gained', 'handoff_confirmed', 'code_attempted', 'qr_scanned',
  'kit_opened', 'trail_saved', 'mission_control_opened',
  'device_fallback_used', 'checkpoint_reached'
));

-- Detail may carry only these structural keys — never free text, never a
-- child, never content (D-76).
alter table analytics_events drop constraint if exists analytics_events_detail_keys_check;
alter table analytics_events add constraint analytics_events_detail_keys_check check (
  (detail - array['option', 'variant', 'event', 'device', 'outcome', 'level',
                  'screen_type', 'gap', 'source', 'unlock', 'checkpoint']) = '{}'::jsonb
);
create index if not exists analytics_events_run_idx on analytics_events (run_key, occurred_at);
create index if not exists analytics_events_version_idx on analytics_events (mission_id, mission_version, name);

-- ------------------------------------------------ 5. engine store ---------
-- Service role only. The caller has already authorised the run.

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
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function engine_load_run(uuid) from public, anon, authenticated;
grant execute on function engine_load_run(uuid) to service_role;

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
  insert into analytics_events (name, mission_id, mission_version, run_key, screen_key, detail)
  select ev->>'name', v_p.mission_id, v_p.mission_version, v_p.analytics_key,
         ev->>'screen_key', coalesce(ev->'detail', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) ev;

  return v_p;
end;
$$;
revoke all on function engine_save(uuid, jsonb, jsonb, text, text, jsonb, boolean, jsonb, jsonb) from public, anon, authenticated;
grant execute on function engine_save(uuid, jsonb, jsonb, text, text, jsonb, boolean, jsonb, jsonb) to service_role;

-- Analytics for events that happen outside an interaction (a Kit opened, a
-- QR scanned, Mission Control opened). Same allow-lists; service role only.
create or replace function engine_record_events(p_progress_id uuid, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_p mission_progress;
begin
  select * into v_p from mission_progress where id = p_progress_id;
  if not found then return; end if;
  insert into analytics_events (name, mission_id, mission_version, run_key, screen_key, detail)
  select ev->>'name', v_p.mission_id, v_p.mission_version, v_p.analytics_key,
         ev->>'screen_key', coalesce(ev->'detail', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) ev;
  -- A recorded return starts a new session: refreshing the page must not
  -- count as another return.
  if exists (select 1 from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) ev
             where ev->>'name' = 'session_resumed') then
    update mission_progress set last_activity_at = now() where id = v_p.id;
  end if;
end;
$$;
revoke all on function engine_record_events(uuid, jsonb) from public, anon, authenticated;
grant execute on function engine_record_events(uuid, jsonb) to service_role;
