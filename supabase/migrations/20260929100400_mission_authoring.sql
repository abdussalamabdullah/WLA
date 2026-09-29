-- ===========================================================================
-- MISSION AUTHORING WRITES (D-56)
--
-- The builder needs to create, edit, reorder and remove screens. It does NOT
-- get a policy on mission_screens to do it.
--
-- D-52 removed the last admin policy from that table after a live test showed
-- an administrator could read all 48 rows including concealed Evidence bodies.
-- Adding a write policy now would re-open the same door from the other side:
-- `for all` was exactly the mistake D-54 found on `missions`.
--
-- So authoring goes through these functions instead. Each one:
--   * refuses unless is_admin()
--   * refuses unless the target version is a draft or in review
--   * touches exactly one screen
-- and the immutability trigger still sits underneath as the backstop.
-- ===========================================================================

create or replace function assert_editable_version(p_mission_id uuid, p_version int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status mission_version_status;
begin
  if not is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select status into v_status from mission_versions
   where mission_id = p_mission_id and version = p_version;

  if v_status is null then
    raise exception 'version_not_found' using errcode = 'P0002';
  end if;
  if v_status not in ('draft', 'in_review') then
    raise exception 'version_not_editable' using errcode = '42501';
  end if;
end;
$$;
revoke all on function assert_editable_version(uuid, int) from public, anon, authenticated;

create or replace function admin_upsert_screen(
  p_mission_id uuid,
  p_version int,
  p_screen_key text,
  p_type screen_type,
  p_title text,
  p_body text,
  p_sequence int,
  p_configuration jsonb
)
returns mission_screens
language plpgsql
security definer
set search_path = public
as $$
declare v_row mission_screens;
begin
  perform assert_editable_version(p_mission_id, p_version);

  if p_screen_key !~ '^[a-z0-9]+(_[a-z0-9]+)*$' then
    raise exception 'invalid_screen_key' using errcode = '22023';
  end if;

  insert into mission_screens
    (mission_id, version, screen_key, type, title, body, sequence, configuration)
  values
    (p_mission_id, p_version, p_screen_key, p_type,
     nullif(p_title, ''), nullif(p_body, ''), p_sequence,
     coalesce(p_configuration, '{}'::jsonb))
  on conflict (mission_id, version, screen_key) do update
    set type = excluded.type,
        title = excluded.title,
        body = excluded.body,
        sequence = excluded.sequence,
        configuration = excluded.configuration,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function admin_upsert_screen(uuid, int, text, screen_type, text, text, int, jsonb) from public;
grant execute on function admin_upsert_screen(uuid, int, text, screen_type, text, text, int, jsonb) to authenticated;

create or replace function admin_delete_screen(
  p_mission_id uuid, p_version int, p_screen_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_editable_version(p_mission_id, p_version);
  delete from mission_screens
   where mission_id = p_mission_id and version = p_version
     and screen_key = p_screen_key;
end;
$$;
revoke all on function admin_delete_screen(uuid, int, text) from public;
grant execute on function admin_delete_screen(uuid, int, text) to authenticated;

/*
 * Move a screen one place up or down.
 *
 * Swaps the two sequence values rather than renumbering everything, so the
 * operation is local and two admins reordering different parts of a long
 * mission cannot clobber each other's work. The unique index is on
 * (mission_id, version, screen_key), not on sequence, so a transient equal
 * sequence during the swap is not an error — but the swap is done in one
 * statement anyway.
 */
create or replace function admin_move_screen(
  p_mission_id uuid, p_version int, p_screen_key text, p_direction text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq   int;
  v_other text;
  v_other_seq int;
begin
  perform assert_editable_version(p_mission_id, p_version);

  select sequence into v_seq from mission_screens
   where mission_id = p_mission_id and version = p_version and screen_key = p_screen_key;
  if v_seq is null then
    raise exception 'screen_not_found' using errcode = 'P0002';
  end if;

  if p_direction = 'up' then
    select screen_key, sequence into v_other, v_other_seq from mission_screens
     where mission_id = p_mission_id and version = p_version and sequence < v_seq
     order by sequence desc limit 1;
  elsif p_direction = 'down' then
    select screen_key, sequence into v_other, v_other_seq from mission_screens
     where mission_id = p_mission_id and version = p_version and sequence > v_seq
     order by sequence asc limit 1;
  else
    raise exception 'invalid_direction' using errcode = '22023';
  end if;

  -- Already at the end: not an error, just nothing to do.
  if v_other is null then return; end if;

  update mission_screens
     set sequence = case screen_key when p_screen_key then v_other_seq else v_seq end,
         updated_at = now()
   where mission_id = p_mission_id and version = p_version
     and screen_key in (p_screen_key, v_other);
end;
$$;
revoke all on function admin_move_screen(uuid, int, text, text) from public;
grant execute on function admin_move_screen(uuid, int, text, text) to authenticated;

create or replace function admin_set_completion_rule(
  p_mission_id uuid, p_version int, p_rule jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_editable_version(p_mission_id, p_version);
  update mission_versions
     set completion_rule = p_rule, updated_at = now()
   where mission_id = p_mission_id and version = p_version;
end;
$$;
revoke all on function admin_set_completion_rule(uuid, int, jsonb) from public;
grant execute on function admin_set_completion_rule(uuid, int, jsonb) to authenticated;

/*
 * PREVIEW — brief §16, "preview the mission exactly as a learner would".
 *
 * Returns ONE screen of a draft by key, in the same shape
 * get_current_mission_screen returns, so the preview renders through the real
 * engine and registry rather than through a parallel rendering path.
 *
 * Restricted to draft/in_review. A published version is previewed by playing
 * it as a learner, which is the honest way to see it.
 */
create or replace function admin_preview_screen(
  p_mission_id uuid, p_version int, p_screen_key text default null
)
returns table (
  screen_key text, type screen_type, title text, body text,
  sequence int, configuration jsonb, next_sequence_key text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare v_key text;
begin
  perform assert_editable_version(p_mission_id, p_version);

  v_key := coalesce(
    p_screen_key,
    (select s.screen_key from mission_screens s
      where s.mission_id = p_mission_id and s.version = p_version
      order by s.sequence asc limit 1)
  );
  if v_key is null then return; end if;

  return query
  select s.screen_key, s.type, s.title, s.body, s.sequence, s.configuration,
    (select n.screen_key from mission_screens n
      where n.mission_id = p_mission_id and n.version = p_version
        and n.sequence > s.sequence
      order by n.sequence asc limit 1)
  from mission_screens s
  where s.mission_id = p_mission_id and s.version = p_version
    and s.screen_key = v_key;
end;
$$;
revoke all on function admin_preview_screen(uuid, int, text) from public;
grant execute on function admin_preview_screen(uuid, int, text) to authenticated;
