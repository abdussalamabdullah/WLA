import "server-only";

import { requireEntitledMission, requireOwnedChild } from "@/lib/permissions";
import type { MissionEvidenceRow, WlaLab } from "@/types/database";

/**
 * Signed URL lifetime for digital evidence.
 *
 * Shorter than a Mission Kit link: evidence is the child's own private
 * material (Architecture §15), it is viewed briefly rather than worked from,
 * and Tech Spec §47 forbids any permanent URL for it. Re-minted per page load.
 */
const EVIDENCE_URL_TTL_SECONDS = 15 * 60;

export type EvidenceWithUrl = {
  evidence: MissionEvidenceRow;
  /**
   * Signed URL for stored files only.
   *
   * ALWAYS null for physical evidence, and null for digital evidence whose
   * content is a saved response rather than a file. The Academy must never
   * imply it holds an artefact it does not (Architecture §15, Brief §27,
   * UI/UX §44) — so a URL is minted only when storage_path is set.
   */
  url: string | null;
};

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
): Promise<{ missionTitle: string; lab: WlaLab; evidence: EvidenceWithUrl[] }> {
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

  return {
    missionTitle: mission.title,
    lab: mission.lab,
    evidence: await withSignedUrls(supabase, data ?? []),
  };
}

/**
 * Mint signed URLs for stored evidence files.
 *
 * Uses the caller's own session, never the service role: the evidence bucket
 * policy re-checks family ownership against the object path, and a
 * service-role URL would bypass that check entirely.
 *
 * Six Names requires no upload, so in practice every entry here is physical
 * or response-backed and this returns nothing to sign. It exists so a mission
 * that DOES store a file works without further engine change.
 */
async function withSignedUrls(
  supabase: Awaited<ReturnType<typeof requireOwnedChild>>["supabase"],
  rows: MissionEvidenceRow[],
): Promise<EvidenceWithUrl[]> {
  const paths = rows
    .filter((r) => r.type === "digital" && r.storage_path)
    .map((r) => r.storage_path as string);

  if (paths.length === 0) {
    return rows.map((evidence) => ({ evidence, url: null }));
  }

  const { data: signed } = await supabase.storage
    .from("mission-evidence")
    .createSignedUrls(paths, EVIDENCE_URL_TTL_SECONDS);

  const urlByPath = new Map<string, string | null>(
    (signed ?? []).map((s) => [s.path ?? "", s.error ? null : s.signedUrl]),
  );

  return rows.map((evidence) => ({
    evidence,
    url: evidence.storage_path
      ? (urlByPath.get(evidence.storage_path) ?? null)
      : null,
  }));
}

/** The child's Trail across every mission. */
export async function getAllEvidence(
  childId: string,
): Promise<EvidenceWithUrl[]> {
  const { child, supabase } = await requireOwnedChild(childId);

  const { data } = await supabase
    .from("mission_evidence")
    .select("*")
    .eq("child_id", child.id)
    .order("created_at", { ascending: false });

  return withSignedUrls(supabase, data ?? []);
}
