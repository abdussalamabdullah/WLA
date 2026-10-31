-- ============================================================================
-- MISSION COVER IMAGES (D-146).
--
-- A dedicated PUBLIC bucket. Covers are catalogue artwork shown to everyone, on
-- the Academy and on the public website. `mission-media` stays private because it
-- holds what happens inside a mission (D-89), so it is not touched here.
--
-- Public means readable by address. There is deliberately no anonymous SELECT
-- policy, so nobody can list the bucket, and anonymous users can't write to it.
-- Only an administrator can upload or delete. No UPDATE policy: replacing a cover
-- is a new object and a change to the mission.
--
-- The bucket enforces 10 MB and raster types. It trusts the declared type, so the
-- server also checks the actual bytes after upload (registerCoverUploadAction).
-- SVG is refused: it can carry script.
--
-- Deleting is refused while any mission references the file. A duplicated mission
-- shares its source's cover, so a file can have more than one user.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mission-covers', 'mission-covers', true,
  10 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create or replace function private.mission_cover_in_use(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from missions m where m.cover_image = 'mission-covers/' || p_name);
$$;
revoke all on function private.mission_cover_in_use(text) from public;
grant execute on function private.mission_cover_in_use(text) to authenticated;

drop policy if exists "admins upload mission covers" on storage.objects;
create policy "admins upload mission covers" on storage.objects
  for insert to authenticated with check (bucket_id = 'mission-covers' and is_admin());

-- Admins read to check an upload's bytes and to sweep abandoned uploads.
drop policy if exists "admins read mission covers" on storage.objects;
create policy "admins read mission covers" on storage.objects
  for select to authenticated using (bucket_id = 'mission-covers' and is_admin());

drop policy if exists "admins delete unused mission covers" on storage.objects;
create policy "admins delete unused mission covers" on storage.objects
  for delete to authenticated using (
    bucket_id = 'mission-covers' and is_admin() and not private.mission_cover_in_use(name)
  );
