-- ============================================================================
-- Fix: an entitled family could not read the mission row itself.
--
-- FOUND BY HOSTED VALIDATION of the seeded Six Names mission.
--
-- The init migration gave `missions` a single read policy:
--     create policy "published missions are readable" ... using (published = true)
--
-- But its child tables are gated on ENTITLEMENT, not publication:
--     "resources require entitlement"     on mission_resources
--     "parent notes require entitlement"  on mission_parent_notes
--
-- So an entitled family could read a mission's resources and parent note while
-- the mission row itself stayed invisible. Every server path begins by loading
-- that row — requireEntitledMission, getMissionHome, getMissionStage — so the
-- whole mission became unreachable and surfaced as "Mission not found".
--
-- Observed on staging: Six Names is seeded `published = false` (pending
-- artwork, OPEN-13), and an entitled child could not open it at all.
--
-- WHY THIS IS A DEFECT, NOT A DESIGN CHOICE
-- `published` controls CATALOGUE VISIBILITY — whether a mission is offered for
-- sale. Entitlement controls ACCESS. Conflating them means withdrawing a
-- mission from sale would silently break every family who already owns it,
-- which contradicts:
--   Architecture §4  — purchased, unlocked or redeemed missions appear in
--                      My Missions, and status persists
--   Architecture §17 — completed missions remain accessible
-- and is the same class of failure that mission version pinning exists to
-- prevent.
--
-- The fix adds a second, narrower read path. The existing public policy is
-- left untouched: Postgres ORs multiple permissive policies, so a published
-- mission stays readable by everyone exactly as before, and an unpublished one
-- becomes readable only by a family holding an active entitlement for it.
-- ============================================================================

create policy "entitled families can read their missions" on missions
  for select using (
    exists (
      select 1
      from mission_entitlements e
      join child_profiles c on c.id = e.child_id
      where e.mission_id = missions.id
        and c.parent_id = auth.uid()
        and e.status = 'active'
    )
  );
