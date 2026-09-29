import "server-only";

import { cache } from "react";

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
      | "not_admin"
      | "not_found",
  ) {
    super(message);
    this.name = "AccessError";
  }
}

/**
 * The database or auth service could not be reached — NOT an answer about
 * access.
 *
 * Every check below reads a row and treats "no row" as "not yours". Before
 * this existed they also treated a FAILED read as "no row", so on a flaky
 * connection a parent was told their own child "does not belong to this
 * account" (found in staging QA with 80% packet loss). Both still fail closed —
 * nothing is served — but only a real empty result is reported as a denial.
 * Callers that turn AccessError into a 404 let this reach the error boundary,
 * which offers a retry.
 */
export class ServiceUnavailableError extends Error {
  constructor(readonly operation: string) {
    super("The service is unavailable. Please try again.");
    this.name = "ServiceUnavailableError";
  }
}

/** Unwrap a query result, refusing to read a failed query as an empty one. */
function read<T>(
  operation: string,
  result: { data: T; error: { message: string } | null },
): T {
  if (result.error) throw new ServiceUnavailableError(operation);
  return result.data;
}

/**
 * Tech Spec §25, step 1. Throws rather than returning null — callers should
 * not be able to forget the check.
 *
 * DEDUPED PER REQUEST with React's `cache()`.
 *
 * `auth.getUser()` revalidates against Supabase over the network — it is not a
 * local cookie read, and that is deliberate (a cookie is not proof). But every
 * step of the chain calls this, so one Mission Kit render made six concurrent
 * calls to GoTrue; it began rejecting them and the client retried with
 * backoff, taking the page from ~2s to 25–44s. Measured in production mode
 * against staging, and visible in the server log as AuthRetryableFetchError.
 *
 * `cache()` memoises for the lifetime of ONE request only. It does not cache
 * across requests, users or renders, so the security property is unchanged:
 * every request still revalidates the session with Supabase exactly once.
 */
export const requireParent = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // An unreachable auth service is not the same as being signed out: sending
  // a signed-in parent to /login would be wrong, and would lose their place.
  if (error && (error.status === undefined || error.status === 0 || error.status >= 500)) {
    throw new ServiceUnavailableError("auth.getUser");
  }
  if (!user) {
    throw new AccessError("Not signed in.", "unauthenticated");
  }
  return { supabase, user };
});

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

  const child = read(
    "requireOwnedChild",
    await supabase
      .from("child_profiles")
      .select("*")
      .eq("id", childId)
      .eq("parent_id", user.id) // ← the family boundary, re-asserted in the query
      .maybeSingle(),
  );

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

  const mission = read(
    "requireEntitledMission.mission",
    await supabase
      .from("missions")
      .select("*")
      .eq(isUuid ? "id" : "slug", missionIdOrSlug)
      .maybeSingle(),
  );

  if (!mission) {
    throw new AccessError("Mission not found.", "not_found");
  }

  const entitlement = read(
    "requireEntitledMission.entitlement",
    await supabase
      .from("mission_entitlements")
      .select("id")
      .eq("child_id", child.id)
      .eq("mission_id", mission.id)
      .eq("status", "active")
      .maybeSingle(),
  );

  if (!entitlement) {
    throw new AccessError(
      "This child does not have access to this mission.",
      "not_entitled",
    );
  }

  // Progress may legitimately not exist yet (status: Not Started).
  // A failed read here must not look like "Not Started" either.
  const progress = read(
    "requireEntitledMission.progress",
    await supabase
      .from("mission_progress")
      .select("*")
      .eq("child_id", child.id)
      .eq("mission_id", mission.id)
      .maybeSingle(),
  );

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

  const progress = read(
    "requireOwnedProgress",
    await supabase
      .from("mission_progress")
      .select("*")
      .eq("id", progressId)
      .eq("child_id", child.id) // ← the child boundary, re-asserted
      .maybeSingle(),
  );

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

  const state = read(
    "requireOwnedState",
    await supabase
      .from("mission_state")
      .select("*")
      .eq("progress_id", progress.id)
      .maybeSingle(),
  );

  return { progress, state: state ?? null, supabase };
}

/** Step 4, for evidence. Mission Trail must never surface a sibling's record. */
export async function requireOwnedEvidence(
  childId: string,
  evidenceId: string,
) {
  const { child, supabase } = await requireOwnedChild(childId);

  const evidence = read(
    "requireOwnedEvidence",
    await supabase
      .from("mission_evidence")
      .select("*")
      .eq("id", evidenceId)
      .eq("child_id", child.id)
      .maybeSingle(),
  );

  if (!evidence) {
    throw new AccessError(
      "That evidence does not belong to this child.",
      "not_this_childs_record",
    );
  }
  return { evidence, supabase };
}

/**
 * CMS-01 — the internal admin gate.
 *
 * A SEPARATE AXIS FROM THE FAMILY CHAIN ABOVE. Everything else in this module
 * answers "may this parent reach this child's record". This answers "may this
 * account edit catalogue content", and the two never substitute for each
 * other: an admin gets no additional access to any family's mission data,
 * because none of the child-scoped functions consult `is_admin`.
 *
 * The flag lives on `profiles.is_admin` and is set by hand in the Supabase
 * dashboard. There is deliberately no self-service route to becoming an admin
 * and no interface anywhere that writes this column — it is not an editable
 * field, and a content editor must not be able to promote themselves.
 *
 * This check is the SECOND line, not the first. Every admin table already
 * carries an `is_admin()` RLS policy, so a write refused here would be refused
 * again at the database. Both exist so that a mistake in either one is not
 * sufficient on its own.
 */
export async function requireAdmin() {
  const { supabase, user } = await requireParent();

  const profile = read(
    "requireAdmin",
    await supabase
      .from("profiles")
      .select("id, email, is_admin")
      .eq("id", user.id)
      .maybeSingle(),
  );

  if (!profile?.is_admin) {
    throw new AccessError("Not an administrator.", "not_admin");
  }
  return { supabase, user, profile };
}
