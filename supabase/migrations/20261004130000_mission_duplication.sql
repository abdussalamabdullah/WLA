-- ============================================================================
-- 0030 — Mission duplication (Enhancement Plan §12: mission duplication)
-- ============================================================================
--
-- An admin may duplicate a mission into a new, unpublished mission whose v1
-- draft carries the source's screens, definition, completion rule, Kit rows and
-- parent note. The copy happens INSIDE the database: an admin has no read path
-- to published content (D-52, D-61), and duplicating must not open one.
--
-- Kit FILES cannot be copied in SQL (the bytes live in object storage). The
-- function rewrites each resource's path into the new mission's folder — the
-- family read policy keys entitlement on that folder (D-68) — and returns the
-- (from, to) pairs; the server action then copies the objects with the admin's
-- own storage permission. Learner records are never copied.
-- ============================================================================

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

  select coalesce(jsonb_agg(jsonb_build_object('from', p, 'to', v_new.id::text || substr(p, length(p_source_id::text) + 1))), '[]'::jsonb)
    into v_files
  from (
    select storage_path p from mission_resources where mission_id = p_source_id and version = v_from
    union
    select document_path from mission_parent_notes where mission_id = p_source_id and version = v_from and document_path is not null
  ) f
  where p like p_source_id::text || '/%';

  return jsonb_build_object('id', v_new.id, 'slug', v_new.slug, 'files', v_files);
end;
$$;
revoke all on function admin_duplicate_mission(uuid, text, text, int) from public, anon;
grant execute on function admin_duplicate_mission(uuid, text, text, int) to authenticated;
