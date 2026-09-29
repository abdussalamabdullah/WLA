-- ============================================================================
-- An administrator could rewrite a mission's VERSION, and delete missions.
--
-- FOUND BY LIVE EXECUTION, 2026-09-28, during the final CMS security pass:
--
--     PATCH /rest/v1/missions?slug=eq.six-names   {"version": 99}   (as admin)
--     -> 1 row changed
--
-- The internal admin's own editor cannot do this — `missionCatalogueSchema`
-- has no `version` field, so a crafted form post cannot reach it either
-- (D-48). But the RLS policy behind it was written `for all`, so a direct API
-- call bypassed the editor entirely.
--
-- WHY VERSION IS THE DANGEROUS ONE
--
-- D-17 pins a run to `missions.version` at start. Setting it to a number with
-- no `mission_screens` rows means every NEW run pins to a version that does
-- not exist, and `get_current_mission_screen` returns nothing — the mission
-- becomes unplayable, silently, for everyone who starts it afterwards. Runs
-- already in progress survive, which is precisely what would make it hard to
-- notice.
--
-- `for all` also granted INSERT and DELETE. Deleting a mission cascades to
-- entitlements and progress: a family's paid access and a child's learning
-- record, removed by a content edit.
--
-- THE FIX mirrors D-49, because the same mechanism applies: withdraw the
-- table-level UPDATE and grant it back column by column. Postgres checks
-- column privileges BEFORE row-level security, so a write to `version` is
-- refused whatever the policy says.
--
-- The editable set is exactly `missionCatalogueSchema` — the fields PRD §32
-- names as "Mission catalogue editing" and "Mission Detail editing".
-- Deliberately absent: `slug` (the permanent address families already hold),
-- `version` and `completion_rule` (D-17 and mission logic, Tech Spec §18),
-- and the generated columns.
-- ============================================================================

-- Replace the blanket policy with the two verbs an editor actually needs.
drop policy if exists "admins manage missions" on missions;

-- SELECT: an editor must see unpublished missions, which the public policy
-- deliberately hides.
create policy "admins read all missions" on missions
  for select using (is_admin());

-- UPDATE: still admin-only at the row level. The column grants below decide
-- WHICH fields; this decides who.
create policy "admins update missions" on missions
  for update using (is_admin()) with check (is_admin());

-- No INSERT and no DELETE policy. Missions are created and removed by
-- migrations and seeds, which run as the table owner — the same rule that
-- already applies to mission_screens.

revoke update on missions from authenticated, anon;
grant update (
  title, description, lab, min_age, max_age, duration, delivery_type,
  price_minor, currency, cover_image, is_free, published, updated_at
) on missions to authenticated;
