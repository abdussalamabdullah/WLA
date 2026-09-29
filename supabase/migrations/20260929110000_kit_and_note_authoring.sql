-- ===========================================================================
-- MISSION KIT AND PARENT NOTE AUTHORING (D-63)
--
-- The brief requires an admin to author Kit resources and the Parent Note, and
-- requires both to follow the SAME versioning and immutability rules as
-- mission structure. They therefore become version-scoped, exactly like
-- mission_screens.
--
-- TWO THINGS ARE FIXED HERE THAT WERE ALREADY WRONG
--
--   `admins manage mission resources` and `admins manage parent notes` were
--   both `for all using (is_admin())`. That is the unscoped grant D-54 had to
--   remove from `missions` after a direct API call mutated a version number:
--   it permits INSERT, UPDATE and DELETE on every row, including rows
--   belonging to a published version. Versioning this content without removing
--   those policies would have made "published Kit resources are immutable"
--   true only in the editor. Both are replaced by `security definer` functions
--   that re-check is_admin() AND draft status, mirroring mission_screens.
--
-- BACKFILL, AND WHY IT DUPLICATES
--   Existing resources and notes carried no version, so historically they
--   applied to EVERY version of their mission. Materialising them for each
--   existing version preserves exactly that, and is lossless. Assigning them
--   only to the current version would silently strip the Mission Kit from the
--   run still pinned to v1.
-- ===========================================================================

alter table mission_resources
  add column if not exists version int not null default 1;
alter table mission_parent_notes
  add column if not exists version int not null default 1;

-- ---------------------------------------------------------------- backfill --
/*
 * STEP 1 — point existing rows at the mission's CURRENT version.
 *
 * The column defaults to 1, which is wrong for any mission past its first
 * version: Six Names' Kit belongs to v2, not v1. Leaving the default in place
 * put the whole Kit on an archived version, so a live run found none and the
 * next `create_mission_version` copied an empty Kit forward. Caught by
 * executing the backfill rather than reading it.
 */
update mission_resources r
   set version = m.version
  from missions m
 where m.id = r.mission_id and r.version <> m.version;

update mission_parent_notes n
   set version = m.version
  from missions m
 where m.id = n.mission_id and n.version <> m.version;

-- STEP 2 — materialise them for every OTHER existing version, because before
-- this migration they carried no version and so applied to all of them.
insert into mission_resources
  (mission_id, title, description, type, storage_path,
   can_view, can_print, can_download, sort_order, version)
select r.mission_id, r.title, r.description, r.type, r.storage_path,
       r.can_view, r.can_print, r.can_download, r.sort_order, mv.version
from mission_resources r
join mission_versions mv on mv.mission_id = r.mission_id
where mv.version <> r.version
  and not exists (
    select 1 from mission_resources x
    where x.mission_id = r.mission_id and x.version = mv.version
      and x.storage_path = r.storage_path
  );

-- The parent note is unique per mission, so the constraint has to widen to
-- (mission_id, version) before a second version can have its own.
alter table mission_parent_notes
  drop constraint if exists mission_parent_notes_mission_id_key;
create unique index if not exists mission_parent_notes_mission_version_key
  on mission_parent_notes (mission_id, version);

insert into mission_parent_notes (mission_id, content, document_path, version)
select n.mission_id, n.content, n.document_path, mv.version
from mission_parent_notes n
join mission_versions mv on mv.mission_id = n.mission_id
where mv.version <> n.version
  and not exists (
    select 1 from mission_parent_notes x
    where x.mission_id = n.mission_id and x.version = mv.version
  );

create index if not exists mission_resources_mission_version_sort_idx
  on mission_resources (mission_id, version, sort_order);

-- ------------------------------------------------------------ immutability --
/*
 * The same guard already used by mission_screens. It reads only
 * `mission_id` and `version` from the row, so it applies unchanged to any
 * version-scoped content table — which is the point of keeping one guard
 * rather than writing a second that could drift.
 */
drop trigger if exists mission_resources_immutable on mission_resources;
create trigger mission_resources_immutable
  before insert or update or delete on mission_resources
  for each row execute function guard_immutable_mission_version();

drop trigger if exists mission_parent_notes_immutable on mission_parent_notes;
create trigger mission_parent_notes_immutable
  before insert or update or delete on mission_parent_notes
  for each row execute function guard_immutable_mission_version();

-- -------------------------------------------- remove the unscoped policies --
drop policy if exists "admins manage mission resources" on mission_resources;
drop policy if exists "admins manage parent notes" on mission_parent_notes;

/*
 * An admin still needs to SEE the Kit and the note to work on them. Read-only,
 * and separate from the write path, so `for all` cannot creep back.
 */
create policy "admins read mission resources" on mission_resources
  for select using (is_admin());
create policy "admins read parent notes" on mission_parent_notes
  for select using (is_admin());

revoke insert, update, delete on mission_resources from authenticated;
revoke insert, update, delete on mission_parent_notes from authenticated;

-- ===================================================== AUTHORING FUNCTIONS ==
create or replace function admin_draft_resources(p_mission_id uuid, p_version int)
returns table (
  id uuid, title text, description text, type resource_type,
  storage_path text, can_view boolean, can_print boolean,
  can_download boolean, sort_order int
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform assert_editable_version(p_mission_id, p_version);
  return query
  select r.id, r.title, r.description, r.type, r.storage_path,
         r.can_view, r.can_print, r.can_download, r.sort_order
  from mission_resources r
  where r.mission_id = p_mission_id and r.version = p_version
  order by r.sort_order asc;
end;
$$;
revoke all on function admin_draft_resources(uuid, int) from public;
grant execute on function admin_draft_resources(uuid, int) to authenticated;

create or replace function admin_upsert_resource(
  p_mission_id uuid,
  p_version int,
  p_id uuid,
  p_title text,
  p_description text,
  p_type resource_type,
  p_storage_path text,
  p_can_view boolean,
  p_can_print boolean,
  p_can_download boolean,
  p_sort_order int
)
returns mission_resources
language plpgsql
security definer
set search_path = public
as $$
declare v_row mission_resources;
begin
  perform assert_editable_version(p_mission_id, p_version);

  if coalesce(trim(p_title), '') = '' then
    raise exception 'resource_needs_title' using errcode = '22023';
  end if;
  if coalesce(trim(p_storage_path), '') = '' then
    raise exception 'resource_needs_file' using errcode = '22023';
  end if;

  /*
   * The path must live under this mission's own folder. The bucket policy
   * keys entitlement on the first path segment, so a resource pointing at
   * another mission's folder would hand its files to the wrong families.
   */
  if (storage.foldername(p_storage_path))[1] <> p_mission_id::text then
    raise exception 'resource_path_outside_mission' using errcode = '42501';
  end if;

  if p_id is null then
    insert into mission_resources
      (mission_id, version, title, description, type, storage_path,
       can_view, can_print, can_download, sort_order)
    values
      (p_mission_id, p_version, trim(p_title), nullif(trim(coalesce(p_description,'')), ''),
       p_type, p_storage_path,
       coalesce(p_can_view, true), coalesce(p_can_print, true),
       coalesce(p_can_download, true), coalesce(p_sort_order, 0))
    returning * into v_row;
  else
    update mission_resources
       set title = trim(p_title),
           description = nullif(trim(coalesce(p_description,'')), ''),
           type = p_type,
           storage_path = p_storage_path,
           can_view = coalesce(p_can_view, true),
           can_print = coalesce(p_can_print, true),
           can_download = coalesce(p_can_download, true),
           sort_order = coalesce(p_sort_order, 0)
     where id = p_id and mission_id = p_mission_id and version = p_version
    returning * into v_row;

    if v_row.id is null then
      raise exception 'resource_not_found' using errcode = 'P0002';
    end if;
  end if;

  return v_row;
end;
$$;
revoke all on function admin_upsert_resource(uuid, int, uuid, text, text, resource_type, text, boolean, boolean, boolean, int) from public;
grant execute on function admin_upsert_resource(uuid, int, uuid, text, text, resource_type, text, boolean, boolean, boolean, int) to authenticated;

create or replace function admin_delete_resource(p_mission_id uuid, p_version int, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_editable_version(p_mission_id, p_version);
  delete from mission_resources
   where id = p_id and mission_id = p_mission_id and version = p_version;
end;
$$;
revoke all on function admin_delete_resource(uuid, int, uuid) from public;
grant execute on function admin_delete_resource(uuid, int, uuid) to authenticated;

create or replace function admin_move_resource(
  p_mission_id uuid, p_version int, p_id uuid, p_direction text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sort int; v_other uuid; v_other_sort int;
begin
  perform assert_editable_version(p_mission_id, p_version);

  select sort_order into v_sort from mission_resources
   where id = p_id and mission_id = p_mission_id and version = p_version;
  if v_sort is null then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;

  if p_direction = 'up' then
    select id, sort_order into v_other, v_other_sort from mission_resources
     where mission_id = p_mission_id and version = p_version and sort_order < v_sort
     order by sort_order desc limit 1;
  elsif p_direction = 'down' then
    select id, sort_order into v_other, v_other_sort from mission_resources
     where mission_id = p_mission_id and version = p_version and sort_order > v_sort
     order by sort_order asc limit 1;
  else
    raise exception 'invalid_direction' using errcode = '22023';
  end if;

  if v_other is null then return; end if;

  update mission_resources
     set sort_order = case id when p_id then v_other_sort else v_sort end
   where id in (p_id, v_other);
end;
$$;
revoke all on function admin_move_resource(uuid, int, uuid, text) from public;
grant execute on function admin_move_resource(uuid, int, uuid, text) to authenticated;

-- ------------------------------------------------------------ parent note --
create or replace function admin_draft_parent_note(p_mission_id uuid, p_version int)
returns table (content text, document_path text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform assert_editable_version(p_mission_id, p_version);
  return query
  select n.content, n.document_path
  from mission_parent_notes n
  where n.mission_id = p_mission_id and n.version = p_version;
end;
$$;
revoke all on function admin_draft_parent_note(uuid, int) from public;
grant execute on function admin_draft_parent_note(uuid, int) to authenticated;

create or replace function admin_save_parent_note(
  p_mission_id uuid, p_version int, p_content text, p_document_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_editable_version(p_mission_id, p_version);

  if coalesce(trim(p_content), '') = '' then
    raise exception 'note_needs_content' using errcode = '22023';
  end if;

  if coalesce(trim(p_document_path), '') <> ''
     and (storage.foldername(p_document_path))[1] <> p_mission_id::text then
    raise exception 'note_path_outside_mission' using errcode = '42501';
  end if;

  insert into mission_parent_notes (mission_id, version, content, document_path)
  values (p_mission_id, p_version, trim(p_content), nullif(trim(coalesce(p_document_path,'')), ''))
  on conflict (mission_id, version) do update
    set content = excluded.content,
        document_path = excluded.document_path,
        updated_at = now();
end;
$$;
revoke all on function admin_save_parent_note(uuid, int, text, text) from public;
grant execute on function admin_save_parent_note(uuid, int, text, text) to authenticated;

-- ============================================ VERSION COPY, NOW INCLUDING ==
-- ============================================ THE KIT AND THE PARENT NOTE ==
/*
 * create_mission_version re-stated so a new draft inherits the Kit and the
 * note as well as the screens.
 *
 * Without this, "create a new version to change a decision" would silently
 * empty the Mission Kit — the new version would publish with no printables
 * and the validator's Kit check would fire on a mission that had a complete
 * Kit a moment earlier.
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

  -- Never reuse a number: max over every table that records one, so a deleted
  -- draft cannot have its number recycled onto pinned history.
  select greatest(
           coalesce((select max(version) from mission_versions where mission_id = p_mission_id), 0),
           coalesce((select max(version) from mission_screens  where mission_id = p_mission_id), 0),
           coalesce((select max(version) from mission_resources where mission_id = p_mission_id), 0),
           coalesce((select max(mission_version) from mission_progress where mission_id = p_mission_id), 0)
         ) + 1
    into v_next;

  insert into mission_versions (mission_id, version, status, completion_rule, created_by)
  select p_mission_id, v_next, 'draft',
         (select completion_rule from mission_versions
           where mission_id = p_mission_id and version = v_from),
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

-- ================================================ VERSION-AWARE READ PATHS ==
/*
 * Which version's Kit should this child see?
 *
 * A started run answers it: the version pinned at start (D-17), so a child
 * part-way through keeps the printables their mission was authored with. A
 * child who has not started yet gets the mission's current published version,
 * which is what they will be pinned to when they do.
 */
create or replace function effective_mission_version(p_child_id uuid, p_mission_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.mission_version from mission_progress p
      where p.child_id = p_child_id and p.mission_id = p_mission_id),
    (select m.version from missions m where m.id = p_mission_id)
  );
$$;
revoke all on function effective_mission_version(uuid, uuid) from public;
grant execute on function effective_mission_version(uuid, uuid) to anon, authenticated;

/*
 * The learner-facing Kit, for either actor.
 *
 * Returns only what the actor is entitled to, at the right version. It
 * deliberately returns storage PATHS, not URLs: minting a URL is a separate,
 * authorised step (see the route handler), and a function that returned URLs
 * would make every caller a signing authority.
 */
create or replace function mission_kit_for_child(p_child_id uuid, p_mission_id uuid)
returns table (
  id uuid, title text, description text, type resource_type,
  storage_path text, can_view boolean, can_print boolean,
  can_download boolean, sort_order int
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare v_version int;
begin
  if not owns_child(p_child_id) then
    raise exception 'not_your_child' using errcode = '42501';
  end if;
  if not exists (
    select 1 from mission_entitlements e
    where e.child_id = p_child_id and e.mission_id = p_mission_id
      and e.status = 'active'
  ) then
    raise exception 'not_entitled' using errcode = '42501';
  end if;

  v_version := effective_mission_version(p_child_id, p_mission_id);

  return query
  select r.id, r.title, r.description, r.type, r.storage_path,
         r.can_view, r.can_print, r.can_download, r.sort_order
  from mission_resources r
  where r.mission_id = p_mission_id and r.version = v_version
  order by r.sort_order asc;
end;
$$;
revoke all on function mission_kit_for_child(uuid, uuid) from public;
grant execute on function mission_kit_for_child(uuid, uuid) to anon, authenticated;

create or replace function child_session_kit(p_token text, p_mission_slug text)
returns table (
  id uuid, title text, description text, type resource_type,
  storage_path text, can_view boolean, can_print boolean,
  can_download boolean, sort_order int
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_child   uuid;
  v_mission uuid;
begin
  v_child := assume_child_actor(p_token);
  select m.id into v_mission from missions m where m.slug = p_mission_slug;
  if v_mission is null then return; end if;
  return query select * from mission_kit_for_child(v_child, v_mission);
end;
$$;
revoke all on function child_session_kit(text, text) from public;
grant execute on function child_session_kit(text, text) to anon, authenticated;

/*
 * AUTHORISE ONE FILE — the whole of the child Kit access decision (D-64).
 *
 * Given a session token and a resource id, either return the storage path the
 * child may read, or nothing. The child id is derived from the token inside
 * the database and is never an argument, so there is no id to forge.
 *
 * The caller is a server route handler that signs the returned path. It holds
 * the authority to sign; this function holds the authority to decide. Keeping
 * those apart is what stops "can sign" from becoming "may read anything".
 */
create or replace function child_session_resource_path(p_token text, p_resource_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child   uuid;
  v_row     mission_resources;
  v_version int;
begin
  v_child := assume_child_actor(p_token);

  select * into v_row from mission_resources where id = p_resource_id;
  if v_row.id is null then return null; end if;

  if not exists (
    select 1 from mission_entitlements e
    where e.child_id = v_child and e.mission_id = v_row.mission_id
      and e.status = 'active'
  ) then
    return null;
  end if;

  -- The resource must belong to the version this child is actually on, so a
  -- resource id from a newer draft cannot be fetched by an older run.
  v_version := effective_mission_version(v_child, v_row.mission_id);
  if v_row.version <> v_version then return null; end if;
  if not coalesce(v_row.can_view, true) then return null; end if;

  return v_row.storage_path;
end;
$$;
revoke all on function child_session_resource_path(text, uuid) from public;
grant execute on function child_session_resource_path(text, uuid) to anon, authenticated;

-- ============================================== ADMIN STORAGE (authoring) ==
/*
 * An admin may write files into the Kit bucket, and only there.
 *
 * The read policy for families is untouched: entitlement still decides who may
 * read, and the bucket stays private. This adds authoring, not access.
 */
drop policy if exists "admins write mission resources" on storage.objects;
create policy "admins write mission resources" on storage.objects
  for insert with check (bucket_id = 'mission-resources' and is_admin());

drop policy if exists "admins update mission resources" on storage.objects;
create policy "admins update mission resources" on storage.objects
  for update using (bucket_id = 'mission-resources' and is_admin())
  with check (bucket_id = 'mission-resources' and is_admin());

drop policy if exists "admins delete mission resources" on storage.objects;
create policy "admins delete mission resources" on storage.objects
  for delete using (bucket_id = 'mission-resources' and is_admin());

drop policy if exists "admins read mission resource files" on storage.objects;
create policy "admins read mission resource files" on storage.objects
  for select using (bucket_id = 'mission-resources' and is_admin());
