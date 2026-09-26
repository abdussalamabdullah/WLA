import "server-only";

import { requireEntitledMission, requireOwnedChild } from "@/lib/permissions";
import type { MissionEvidenceRow } from "@/types/database";

/**
 * MISSION TRAIL — Architecture §15, Tech Spec §23.
 *
 * §23: "The Mission Trail should query evidence belonging to active child +
 * mission(s). It should never expose another child's evidence."
 *
 * Both queries go through the permissions layer, so the child id is verified
 * against the authenticated parent before any evidence row is read.
 *
 * Kept deliberately simple: no filtering, search, sharing, reactions or
 * comments (Tech Spec §23).
 */

export async function getMissionTrail(
  childId: string,
  missionIdOrSlug: string,
): Promise<{ missionTitle: string; evidence: MissionEvidenceRow[] }> {
  const { child, mission, supabase } = await requireEntitledMission(
    childId,
    missionIdOrSlug,
  );

  const { data } = await supabase
    .from("mission_evidence")
    .select("*")
    .eq("child_id", child.id) // ← child boundary
    .eq("mission_id", mission.id)
    .order("created_at", { ascending: true });

  return { missionTitle: mission.title, evidence: data ?? [] };
}

/** The child's Trail across every mission. */
export async function getAllEvidence(
  childId: string,
): Promise<MissionEvidenceRow[]> {
  const { child, supabase } = await requireOwnedChild(childId);

  const { data } = await supabase
    .from("mission_evidence")
    .select("*")
    .eq("child_id", child.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}
