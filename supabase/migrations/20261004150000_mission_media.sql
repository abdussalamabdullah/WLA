-- ============================================================================
-- 0032 — Mission media (F7, Enhancement Plan §7)
-- ============================================================================
--
-- Media that a screen SHOWS — images, diagrams, maps, animation, audio, video
-- — as version-pinned assets. Distinct from the Mission Kit (what WLA gives
-- the family to print and keep, Brief §17): media lives inside the mission's
-- screens and is never listed as a file.
--
-- Access model (same shape as D-64):
--   * no client role can read or write `mission_assets` (no grants, RLS on);
--   * admins author through security-definer functions that require a draft
--     (assert_editable_version) and read drafts only (D-61: no read path to
--     published content through authoring);
--   * learners never touch the table or the bucket. The server signs a
--     short-lived URL for exactly the assets the child's CURRENT projected
--     screen references, at the run's pinned version (store.ts) — so an
--     unreleased asset, or one behind a condition that does not hold, is
--     never signed (release gating);
--   * rows are immutable once their version is published or archived
--     (guard_immutable_mission_version), and published files cannot be
--     deleted (bucket policy below).
--
-- DATA-MODEL.md records the table justification. No child data.
-- ============================================================================

create table if not exists mission_assets (
  id               uuid primary key default gen_random_uuid(),
  mission_id       uuid not null references missions (id) on delete cascade,
  version          int  not null,
  key              text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  kind             text not null check (kind in ('image', 'diagram', 'map', 'animation', 'audio', 'video')),
  storage_path     text not null,
  alt_text         text,
  long_description text,
  transcript       text,
  captions_path    text,
  created_at       timestamptz not null default now(),
  unique (mission_id, version, key),
  check (storage_path like mission_id::text || '/%'),
  check (captions_path is null or captions_path like mission_id::text || '/%')
);
alter table mission_assets enable row level security;
revoke all on mission_assets from public, anon, authenticated;
grant select, insert, update, delete on mission_assets to service_role;

drop trigger if exists mission_assets_immutable on mission_assets;
create trigger mission_assets_immutable
  before insert or update or delete on mission_assets
  for each row execute function guard_immutable_mission_version();

-- ------------------------------------------------------------------ bucket --
insert into storage.buckets (id, name, public)
values ('mission-media', 'mission-media', false)
on conflict (id) do nothing;

create or replace function private.mission_media_released(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from mission_assets a
    join mission_versions mv on mv.mission_id = a.mission_id and mv.version = a.version
    where (a.storage_path = p_name or a.captions_path = p_name)
      and mv.status in ('published', 'archived')
  );
$$;
revoke all on function private.mission_media_released(text) from public;
grant execute on function private.mission_media_released(text) to authenticated;

drop policy if exists "admins write mission media" on storage.objects;
create policy "admins write mission media" on storage.objects
  for insert to authenticated with check (bucket_id = 'mission-media' and is_admin());

-- Admins read media to preview drafts (signed with their own session).
drop policy if exists "admins read mission media" on storage.objects;
create policy "admins read mission media" on storage.objects
  for select to authenticated using (bucket_id = 'mission-media' and is_admin());

-- Never an UPDATE policy: replacing means a new object and a row change.
drop policy if exists "admins delete mission media" on storage.objects;
create policy "admins delete mission media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'mission-media' and is_admin() and not private.mission_media_released(name)
  );

-- ---------------------------------------------------------------- authoring --
create or replace function admin_upsert_asset(
  p_mission_id uuid,
  p_version int,
  p_key text,
  p_kind text,
  p_storage_path text,
  p_alt_text text,
  p_long_description text,
  p_transcript text,
  p_captions_path text
)
returns mission_assets
language plpgsql
security definer
set search_path = public
as $$
declare v_row mission_assets;
begin
  perform assert_editable_version(p_mission_id, p_version);
  if p_storage_path not like p_mission_id::text || '/%'
     or (p_captions_path is not null and p_captions_path not like p_mission_id::text || '/%') then
    raise exception 'asset_path_outside_mission' using errcode = '22023';
  end if;
  insert into mission_assets (mission_id, version, key, kind, storage_path, alt_text, long_description, transcript, captions_path)
  values (p_mission_id, p_version, p_key, p_kind, p_storage_path,
          nullif(trim(p_alt_text), ''), nullif(trim(p_long_description), ''), nullif(trim(p_transcript), ''), p_captions_path)
  on conflict (mission_id, version, key) do update set
    kind = excluded.kind, storage_path = excluded.storage_path, alt_text = excluded.alt_text,
    long_description = excluded.long_description, transcript = excluded.transcript, captions_path = excluded.captions_path
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function admin_upsert_asset(uuid, int, text, text, text, text, text, text, text) from public, anon;
grant execute on function admin_upsert_asset(uuid, int, text, text, text, text, text, text, text) to authenticated;

create or replace function admin_delete_asset(p_mission_id uuid, p_version int, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_editable_version(p_mission_id, p_version);
  delete from mission_assets where mission_id = p_mission_id and version = p_version and key = p_key;
end;
$$;
revoke all on function admin_delete_asset(uuid, int, text) from public, anon;
grant execute on function admin_delete_asset(uuid, int, text) to authenticated;

-- Draft-only read (D-61): an admin cannot use authoring to read published media.
create or replace function admin_draft_assets(p_mission_id uuid, p_version int)
returns setof mission_assets
language plpgsql
security definer
set search_path = public
as $$
begin
  perform assert_editable_version(p_mission_id, p_version);
  return query select * from mission_assets
    where mission_id = p_mission_id and version = p_version order by key;
end;
$$;
revoke all on function admin_draft_assets(uuid, int) from public, anon;
grant execute on function admin_draft_assets(uuid, int) to authenticated;

-- ------------------------------------------- versions and duplicates copy it --
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

  -- F7: media travels with its version (0032). Same objects; a published
  -- version's files are never rewritten, so sharing them is safe.
  insert into mission_assets
    (mission_id, version, key, kind, storage_path, alt_text, long_description, transcript, captions_path)
  select mission_id, v_next, key, kind, storage_path, alt_text, long_description, transcript, captions_path
  from mission_assets
  where mission_id = p_mission_id and version = v_from;

  return v_row;
end;
$$;
revoke all on function create_mission_version(uuid, int) from public;
grant execute on function create_mission_version(uuid, int) to authenticated;

create or replace function admin_duplicate_mission(
  p_source_id uuid,
  p_slug text,
  p_title text,
  p_from_version int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src  missions;
  v_from int;
  v_new  missions;
  v_files jsonb := '[]'::jsonb;
begin
  if not is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  select * into v_src from missions where id = p_source_id;
  if not found then raise exception 'mission_not_found' using errcode = 'P0002'; end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'invalid_slug' using errcode = '22023'; end if;
  if exists (select 1 from missions where slug = p_slug) then raise exception 'slug_taken' using errcode = '23505'; end if;

  v_from := coalesce(p_from_version, v_src.version);
  if not exists (select 1 from mission_versions where mission_id = p_source_id and version = v_from) then
    raise exception 'version_not_found' using errcode = 'P0002';
  end if;

  insert into missions (slug, title, description, lab, min_age, max_age, duration,
                        delivery_type, cover_image, price_minor, currency, is_free,
                        version, published)
  values (p_slug, p_title, v_src.description, v_src.lab, v_src.min_age, v_src.max_age,
          v_src.duration, v_src.delivery_type, v_src.cover_image, v_src.price_minor,
          v_src.currency, v_src.is_free, 1, false)
  returning * into v_new;

  insert into mission_versions (mission_id, version, status, completion_rule, definition, created_by)
  select v_new.id, 1, 'draft', mv.completion_rule, mv.definition, auth.uid()
  from mission_versions mv where mv.mission_id = p_source_id and mv.version = v_from;

  insert into mission_screens (mission_id, version, screen_key, type, title, body, sequence, configuration)
  select v_new.id, 1, screen_key, type, title, body, sequence, configuration
  from mission_screens where mission_id = p_source_id and version = v_from;

  insert into mission_resources (mission_id, version, title, description, type, storage_path,
                                 can_view, can_print, can_download, sort_order)
  select v_new.id, 1, title, description, type,
         v_new.id::text || substr(storage_path, length(p_source_id::text) + 1),
         can_view, can_print, can_download, sort_order
  from mission_resources
  where mission_id = p_source_id and version = v_from;

  insert into mission_parent_notes (mission_id, version, content, document_path)
  select v_new.id, 1, content,
         case when document_path is null then null
              else v_new.id::text || substr(document_path, length(p_source_id::text) + 1) end
  from mission_parent_notes where mission_id = p_source_id and version = v_from;

  insert into mission_assets (mission_id, version, key, kind, storage_path, alt_text, long_description, transcript, captions_path)
  select v_new.id, 1, key, kind,
         v_new.id::text || substr(storage_path, length(p_source_id::text) + 1),
         alt_text, long_description, transcript,
         case when captions_path is null then null
              else v_new.id::text || substr(captions_path, length(p_source_id::text) + 1) end
  from mission_assets where mission_id = p_source_id and version = v_from;

  -- Files to copy, by bucket: Kit and notes in mission-resources, media in mission-media.
  select coalesce(jsonb_agg(jsonb_build_object('bucket', bkt, 'from', p, 'to', v_new.id::text || substr(p, length(p_source_id::text) + 1))), '[]'::jsonb)
    into v_files
  from (
    select 'mission-resources' bkt, storage_path p from mission_resources where mission_id = p_source_id and version = v_from
    union
    select 'mission-resources', document_path from mission_parent_notes where mission_id = p_source_id and version = v_from and document_path is not null
    union
    select 'mission-media', storage_path from mission_assets where mission_id = p_source_id and version = v_from
    union
    select 'mission-media', captions_path from mission_assets where mission_id = p_source_id and version = v_from and captions_path is not null
  ) f
  where p like p_source_id::text || '/%';

  return jsonb_build_object('id', v_new.id, 'slug', v_new.slug, 'files', v_files);
end;
$$;
revoke all on function admin_duplicate_mission(uuid, text, text, int) from public, anon;
grant execute on function admin_duplicate_mission(uuid, text, text, int) to authenticated;
