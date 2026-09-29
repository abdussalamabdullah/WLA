import "server-only";

import { AccessError, requireParent } from "@/lib/permissions";
import { resolveActiveChild } from "@/features/children/active-child";
import { getChildSession, type ChildSession } from "@/lib/child-session";

/**
 * WHO IS LOOKING AT THE ACADEMY — D-58.
 *
 * Two actors can now reach /academy: a signed-in parent with a selected child,
 * and a child holding their own session. The screens are largely the same
 * (UI/UX and the LMS brief both show one "My Missions"), so the difference is
 * resolved once, here, rather than in every page.
 *
 * WHAT THIS DOES NOT DO: it does not authorise anything. A parent actor still
 * carries only a child id that `lib/permissions` re-verifies on every query; a
 * child actor carries only an opaque token that the database exchanges for a
 * child id on every call. Nothing downstream may treat `childId` from a parent
 * actor as proof of anything — it is an input to the checks, not a result of
 * them.
 */

export type AcademyActor =
  | { kind: "parent"; childId: string; canManageFamily: true }
  | { kind: "child"; session: ChildSession; childId: string; canManageFamily: false }
  | { kind: "parent_needs_child"; children: { id: string; display_name: string }[] }
  | { kind: "parent_no_children" }
  | { kind: "anonymous" };

export async function resolveAcademyActor(): Promise<AcademyActor> {
  /*
   * A child session is checked FIRST and wins.
   *
   * On a shared family device both cookies can exist at once. Resolving the
   * child first means a child who has signed in sees their own missions rather
   * than whichever sibling the parent last selected — and, more importantly,
   * that the reduced child surface cannot be escaped merely because a parent
   * session happens to be lying around in the same browser.
   */
  const child = await getChildSession();
  if (child) {
    return {
      kind: "child",
      session: child,
      childId: child.childId,
      canManageFamily: false,
    };
  }

  try {
    await requireParent();
  } catch (error) {
    // Only a real "not signed in" is anonymous. An unreachable auth service
    // (ServiceUnavailableError) must surface as a failure to retry, not as
    // a signed-out visitor sent to /login.
    if (error instanceof AccessError) return { kind: "anonymous" };
    throw error;
  }

  const active = await resolveActiveChild();
  if (active.status === "no_children") return { kind: "parent_no_children" };
  if (active.status === "needs_selection") {
    return { kind: "parent_needs_child", children: active.children };
  }
  return { kind: "parent", childId: active.childId, canManageFamily: true };
}

/** True when the actor is a resolved learner context (parent+child, or child). */
export function isLearnerActor(
  actor: AcademyActor,
): actor is Extract<AcademyActor, { childId: string }> {
  return actor.kind === "parent" || actor.kind === "child";
}
