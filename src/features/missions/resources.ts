import "server-only";

import { requireEntitledMission } from "@/lib/permissions";
import type { MissionResourceRow } from "@/types/database";

/**
 * MISSION KIT RESOURCE ACCESS — Architecture §7, Tech Spec §20, §47.
 *
 * Kit files live in the private `mission-resources` bucket. Tech Spec §47:
 * "Do not expose permanent public URLs." So access is a short-lived signed
 * URL, minted per request.
 *
 * Authorisation is layered, as everywhere else:
 *   1. requireEntitledMission — authenticated parent, owns the child, child
 *      is entitled to this mission
 *   2. Storage RLS — the bucket policy independently re-checks entitlement
 *      against the object's path, using the caller's own session
 *
 * The session client is used deliberately rather than the service role: a
 * signed URL minted by the service role would bypass the bucket policy, and
 * that policy is the only thing standing between one family and another
 * family's files if step 1 were ever bypassed.
 */

/**
 * Signed URL lifetime.
 *
 * One hour — comfortably longer than a Six Names sitting (60–75 minutes per
 * the Build Brief) so a link cannot expire mid-mission, and short enough that
 * a shared or logged URL stops working quickly. URLs are re-minted on every
 * page load, so this is a ceiling, not a session budget.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type ResourceWithUrl = {
  resource: MissionResourceRow;
  /** Null when the file is missing from Storage — the UI shows unavailable. */
  url: string | null;
};

/**
 * Mission Kit resources with a signed URL each.
 *
 * A missing file yields `url: null` rather than throwing. That is deliberate:
 * Architecture §7 keeps the Kit available before, during and after a mission,
 * so one absent asset must not take down the whole Kit — the others stay
 * usable and the missing one shows its unavailable state (UI/UX §56).
 */
export async function getMissionKit(
  childId: string,
  missionIdOrSlug: string,
): Promise<ResourceWithUrl[]> {
  const { mission, supabase } = await requireEntitledMission(
    childId,
    missionIdOrSlug,
  );

  const { data: resources } = await supabase
    .from("mission_resources")
    .select("*")
    .eq("mission_id", mission.id)
    .order("sort_order", { ascending: true });

  if (!resources?.length) return [];

  /*
   * One batched call rather than N round trips. createSignedUrls returns a
   * per-path result, so a missing file degrades that entry alone.
   */
  const { data: signed } = await supabase.storage
    .from("mission-resources")
    .createSignedUrls(
      resources.map((r) => r.storage_path),
      SIGNED_URL_TTL_SECONDS,
    );

  const urlByPath = new Map<string, string | null>(
    (signed ?? []).map((s) => [s.path ?? "", s.error ? null : s.signedUrl]),
  );

  return resources.map((resource) => ({
    resource,
    url: urlByPath.get(resource.storage_path) ?? null,
  }));
}

/**
 * A signed URL for the mission's parent note document, if it has one.
 *
 * Same authorisation as the Mission Kit — `requireEntitledMission` first, then
 * the bucket policy re-checking entitlement against the object's own path
 * using the caller's session. The document sits under the mission's folder in
 * the same private bucket, so it is covered by the existing policy with no new
 * grant of any kind.
 *
 * Returns null when the mission has no document, or when the file is missing
 * from Storage. Both cases fall back to the text note rather than erroring:
 * Architecture §8 requires For Parents to stay available, and a parent who
 * cannot open a PDF should still get the guidance.
 */
export async function getParentNoteDocumentUrl(
  childId: string,
  missionIdOrSlug: string,
): Promise<string | null> {
  const { mission, supabase } = await requireEntitledMission(
    childId,
    missionIdOrSlug,
  );

  const { data: note } = await supabase
    .from("mission_parent_notes")
    .select("document_path")
    .eq("mission_id", mission.id)
    .maybeSingle();

  if (!note?.document_path) return null;

  const { data, error } = await supabase.storage
    .from("mission-resources")
    .createSignedUrl(note.document_path, SIGNED_URL_TTL_SECONDS);

  return error ? null : (data?.signedUrl ?? null);
}
