-- ============================================================================
-- Kit ROWS and parent notes follow the version lifecycle for families (D-114)
-- ============================================================================
--
-- D-68 (20260929120000) made Kit FILES release-gated: storage serves an object
-- to an entitled family only if a published or archived version references it.
-- The ROWS describing those files, and the parent note's text, were never
-- given the same rule. Both family policies, from 20260925220000_init.sql,
-- check entitlement only:
--
--   "resources require entitlement"     on mission_resources
--   "parent notes require entitlement"  on mission_parent_notes
--
-- Since D-63 both tables are version-scoped, so an entitled parent could read,
-- straight from PostgREST, the Kit rows (titles, descriptions, storage paths)
-- and the parent note `content` of a DRAFT or IN-REVIEW version — authoring
-- that has not passed review and may never ship. The application never asks
-- for them (every read selects the run's effective version), so nothing in
-- the UI showed it; the policy allowed it.
--
-- `child_session_resources` (20260929100200) had the same gap for a child
-- session: it returned the mission's Kit rows for EVERY version. The app uses
-- `child_session_kit` instead, but the function is granted to anon and
-- reachable as an RPC with a child token.
--
-- Released = `published` or `archived`, exactly as private.mission_file_released
-- (D-68): archived stays readable because runs pinned to it (D-17) still need
-- their Kit and note.
--
-- Admin access is unchanged: "admins read mission resources" and "admins read
-- parent notes" still see every version (the builder previews drafts), and the
-- draft-only admin RPCs keep their D-61 checks. The service role bypasses RLS
-- as before.
-- ============================================================================

-- Families cannot read mission_versions (admin-only policy), so a policy that
-- joined it directly would hide released content too. Same shape as
-- private.mission_file_released: definer, fixed search_path, in the schema
-- PostgREST does not expose, executable only by the role whose policies call
-- it.
create or replace function private.mission_version_released(p_mission_id uuid, p_version integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from mission_versions mv
    where mv.mission_id = p_mission_id
      and mv.version = p_version
      and mv.status in ('published', 'archived')
  );
$$;

revoke all on function private.mission_version_released(uuid, integer) from public;
revoke all on function private.mission_version_released(uuid, integer) from anon, service_role;
grant execute on function private.mission_version_released(uuid, integer) to authenticated;

-- ------------------------------------------------------------ families read --
-- Unchanged except for the final clause and the role: entitlement still
-- decides WHO; the release check decides WHICH versions exist for them. Scoped
-- to `authenticated` (auth.uid() is null for anon, so anon matched nothing
-- before either) so anon never evaluates a function it cannot execute.
drop policy if exists "resources require entitlement" on mission_resources;
create policy "resources require entitlement" on mission_resources
  for select to authenticated using (
    exists (
      select 1
      from mission_entitlements e
      join child_profiles c on c.id = e.child_id
      where e.mission_id = mission_resources.mission_id
        and c.parent_id = auth.uid()
        and e.status = 'active'
    )
    and private.mission_version_released(mission_resources.mission_id, mission_resources.version)
  );

drop policy if exists "parent notes require entitlement" on mission_parent_notes;
create policy "parent notes require entitlement" on mission_parent_notes
  for select to authenticated using (
    exists (
      select 1
      from mission_entitlements e
      join child_profiles c on c.id = e.child_id
      where e.mission_id = mission_parent_notes.mission_id
        and c.parent_id = auth.uid()
        and e.status = 'active'
    )
    and private.mission_version_released(mission_parent_notes.mission_id, mission_parent_notes.version)
  );

-- ----------------------------------------------------- child session RPC --
-- The child's Kit at the version its run is pinned to — the same rows
-- mission_kit_for_child / child_session_kit return — and nothing for a mission
-- the child is not entitled to. Signature, return shape, grants and
-- volatility (VOLATILE, D-97) are unchanged.
create or replace function child_session_resources(p_token text, p_mission_slug text)
returns table (
  id uuid, title text, description text, type resource_type,
  storage_path text, can_view boolean, can_print boolean,
  can_download boolean, sort_order integer
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
    and r.version = effective_mission_version(v_child, m.id)
  order by r.sort_order asc;
end;
$$;

revoke all on function child_session_resources(text, text) from public;
grant execute on function child_session_resources(text, text) to anon, authenticated;
