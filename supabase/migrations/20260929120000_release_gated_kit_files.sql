-- ============================================================================
-- 0026 — Kit FILES follow the version lifecycle, not only Kit ROWS (D-68)
-- ============================================================================
--
-- D-63 made `mission_resources` and `mission_parent_notes` immutable once their
-- version is published, but the OBJECTS those rows point at were governed by
-- policies that knew nothing about versions. Found by reading the live
-- policies on staging:
--
--   1. `admins update/delete mission resources` checked only is_admin(). An
--      admin API call could overwrite or delete the file behind a PUBLISHED
--      resource — the row stays immutable while the printable a child pinned
--      to that version opens changes underneath it.
--
--   2. `entitled families read mission resources` allowed any object in the
--      mission's folder. A draft version's new printable lives in the same
--      folder, so an entitled parent could sign a URL for unpublished Kit
--      content by naming its path (`<mission>/<timestamp>-<name>`).
--
-- Both are the same question: is this object part of a released version?
-- `private.mission_file_released` answers it once, and each policy asks it.
--
-- Released = referenced by a Kit resource or parent-note document of a
-- version that is `published` or `archived`. Archived is included because
-- children pinned to it (D-17) still need their Kit.
-- ============================================================================

-- In a schema PostgREST does not expose (config.toml serves only `public` and
-- `graphql_public`), so this cannot be called as an RPC to probe which paths
-- exist. Policies can still call it.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.mission_file_released(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_bucket = 'mission-resources' and (
    exists (
      select 1
      from mission_resources r
      join mission_versions mv
        on mv.mission_id = r.mission_id and mv.version = r.version
      where r.storage_path = p_name
        and mv.status in ('published', 'archived')
    )
    or exists (
      select 1
      from mission_parent_notes n
      join mission_versions mv
        on mv.mission_id = n.mission_id and mv.version = n.version
      where n.document_path = p_name
        and mv.status in ('published', 'archived')
    )
  );
$$;

revoke all on function private.mission_file_released(text, text) from public;
grant execute on function private.mission_file_released(text, text) to authenticated;

-- ------------------------------------------------------------ families read --
-- Unchanged except for the final clause: entitlement still decides WHO; the
-- release check decides WHICH files exist for them at all.
drop policy if exists "entitled families read mission resources" on storage.objects;
create policy "entitled families read mission resources" on storage.objects
  for select to authenticated using (
    bucket_id = 'mission-resources'
    and exists (
      select 1
      from mission_entitlements e
      join child_profiles c on c.id = e.child_id
      where c.parent_id = auth.uid()
        and e.status = 'active'
        and e.mission_id::text = (storage.foldername(name))[1]
    )
    and private.mission_file_released(bucket_id, name)
  );

-- ---------------------------------------------------------- admins author --
-- No authoring path overwrites an object: uploads use `upsert: false` under a
-- fresh timestamped name, and "replace" means a new object plus a row update.
-- So UPDATE is removed outright rather than narrowed — nothing needs it, and
-- it is the operation that would rewrite a published file in place.
drop policy if exists "admins update mission resources" on storage.objects;

-- DELETE stays for housekeeping of draft uploads and orphans, but never
-- reaches a file a released version depends on.
drop policy if exists "admins delete mission resources" on storage.objects;
create policy "admins delete mission resources" on storage.objects
  for delete to authenticated using (
    bucket_id = 'mission-resources'
    and is_admin()
    and not private.mission_file_released(bucket_id, name)
  );

-- `admins read mission resource files` and `admins write mission resources`
-- are unchanged: an admin reads drafts to preview them, and writes new objects.
