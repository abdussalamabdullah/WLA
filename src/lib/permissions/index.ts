import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ChildProfile = Database["public"]["Tables"]["child_profiles"]["Row"];
type Mission = Database["public"]["Tables"]["missions"]["Row"];
type MissionProgress = Database["public"]["Tables"]["mission_progress"]["Row"];

/**
 * THE ACADEMY ACCESS GATE
 * ───────────────────────
 * Every child-scoped operation in the Academy passes through this module.
 *
 * The authorisation model (client-confirmed, 2026-09-25):
 *
 *   - There are no independent child accounts. The authenticated Supabase user
 *     is the parent/guardian, who owns the account, access and permissions
 *     (Architecture §3).
 *   - Child profiles own mission progress and the learning record.
 *   - Sibling data separation is enforced by SERVER AND DATABASE
 *     AUTHORISATION — not by interface behaviour. Every child-scoped read and
 *     write re-derives the child from a verified ownership lookup.
 *   - Cross-family isolation is absolute and is additionally enforced by RLS.
 *
 * Every child-scoped operation validates, in order:
 *
 *   1. authenticated parent session          → requireParent
 *   2. requested child belongs to that parent → requireOwnedChild
 *   3. child has the required entitlement     → requireEntitledMission
 *   4. requested progress/state/evidence      → requireOwnedProgress
 *      belongs to that child                    requireOwnedEvidence
 *
 * A child id supplied by the browser is never trusted. Neither is a progress,
 * state or evidence id — step 4 exists precisely because holding a valid
 * progress id must not by itself grant access to it.
 *
 * RULE: no feature module may query a child-scoped table directly. If you need
 * data for a child, obtain it through one of these functions.
 */

export class AccessError extends Error {
  constructor(
    message: string,
    readonly reason:
      | "unauthenticated"
      | "not_your_child"
      | "not_entitled"
      | "not_this_childs_record"
      | "not_found",
  ) {
    super(message);
    this.name = "AccessError";
  }
}

/** Tech Spec §25, step 1. Throws rather than returning null — callers should
 *  not be able to forget the check. */
export async function requireParent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AccessError("Not signed in.", "unauthenticated");
  }
  return { supabase, user };
}

/**
 * Tech Spec §25, step 2 — and the single most important function in the app.
 *
 * NEVER trust a childId from the browser. This re-reads the child row scoped to
 * the authenticated parent; a sibling's id (or a stranger's) yields no row.
 */
export async function requireOwnedChild(childId: string): Promise<{
  child: ChildProfile;
  supabase: Awaited<ReturnType<typeof createClient>>;
}> {
  const { supabase, user } = await requireParent();

  const { data: child } = await supabase
    .from("child_profiles")
    .select("*")
    .eq("id", childId)
    .eq("parent_id", user.id) // ← the family boundary, re-asserted in the query
    .maybeSingle();

  if (!child) {
    throw new AccessError(
      "That child profile does not belong to this account.",
      "not_your_child",
    );
  }
  return { child, supabase };
}

/**
 * Tech Spec §25, steps 3–4. The only sanctioned way to open a mission.
 *
 * Architecture §3: "Mission access must be associated with the intended child
 * profile before child-specific progress begins."
 * Tech Spec §26: if entitlement fails, DO NOT render the mission experience.
 */
export async function requireEntitledMission(
  childId: string,
  missionIdOrSlug: string,
): Promise<{
  child: ChildProfile;
  mission: Mission;
  progress: MissionProgress | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}> {
  const { child, supabase } = await requireOwnedChild(childId);

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      missionIdOrSlug,
    );

  const { data: mission } = await supabase
    .from("missions")
    .select("*")
    .eq(isUuid ? "id" : "slug", missionIdOrSlug)
    .maybeSingle();

  if (!mission) {
    throw new AccessError("Mission not found.", "not_found");
  }

  const { data: entitlement } = await supabase
    .from("mission_entitlements")
    .select("id")
    .eq("child_id", child.id)
    .eq("mission_id", mission.id)
    .eq("status", "active")
    .maybeSingle();

  if (!entitlement) {
    throw new AccessError(
      "This child does not have access to this mission.",
      "not_entitled",
    );
  }

  // Progress may legitimately not exist yet (status: Not Started).
  const { data: progress } = await supabase
    .from("mission_progress")
    .select("*")
    .eq("child_id", child.id)
    .eq("mission_id", mission.id)
    .maybeSingle();

  return { child, mission, progress: progress ?? null, supabase };
}

/**
 * Step 4 — a progress record must belong to the stated child.
 *
 * Holding a progress id is not authorisation. This re-reads the row with BOTH
 * the progress id and the verified child id, so a progress row belonging to a
 * sibling (or to anyone else) yields nothing.
 */
export async function requireOwnedProgress(
  childId: string,
  progressId: string,
): Promise<{
  progress: MissionProgress;
  supabase: Awaited<ReturnType<typeof createClient>>;
}> {
  const { child, supabase } = await requireOwnedChild(childId);

  const { data: progress } = await supabase
    .from("mission_progress")
    .select("*")
    .eq("id", progressId)
    .eq("child_id", child.id) // ← the child boundary, re-asserted
    .maybeSingle();

  if (!progress) {
    throw new AccessError(
      "That mission progress does not belong to this child.",
      "not_this_childs_record",
    );
  }
  return { progress, supabase };
}

/**
 * Step 4, for mission state. State hangs off progress, so ownership of the
 * state is ownership of its progress row.
 */
export async function requireOwnedState(childId: string, progressId: string) {
  const { progress, supabase } = await requireOwnedProgress(
    childId,
    progressId,
  );

  const { data: state } = await supabase
    .from("mission_state")
    .select("*")
    .eq("progress_id", progress.id)
    .maybeSingle();

  return { progress, state: state ?? null, supabase };
}

/** Step 4, for evidence. Mission Trail must never surface a sibling's record. */
export async function requireOwnedEvidence(
  childId: string,
  evidenceId: string,
) {
  const { child, supabase } = await requireOwnedChild(childId);

  const { data: evidence } = await supabase
    .from("mission_evidence")
    .select("*")
    .eq("id", evidenceId)
    .eq("child_id", child.id)
    .maybeSingle();

  if (!evidence) {
    throw new AccessError(
      "That evidence does not belong to this child.",
      "not_this_childs_record",
    );
  }
  return { evidence, supabase };
}
