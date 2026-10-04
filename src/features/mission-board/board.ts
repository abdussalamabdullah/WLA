import "server-only";

import { createChildClient } from "@/lib/child-session";
import { requireAdmin, requireOwnedChild, requireParent } from "@/lib/permissions";
import type { AcademyActor } from "@/features/academy/actor";
import type { BoardItem, BoardStatus } from "@/types/database";

/**
 * MISSION BOARD (Plan §9, Architecture §16, D-73, D-96).
 *
 * Every read and write is a database function that re-checks the boundary:
 * the parent's ownership of the child, or the child derived from the session
 * token. Nothing here passes an author to the page — there is none to pass.
 */

/** Published, anonymised approaches to missions this child has completed. */
export async function getBoardFor(actor: AcademyActor): Promise<BoardItem[]> {
  if (actor.kind === "parent") {
    const { supabase, child } = await requireOwnedChild(actor.childId);
    const { data } = await supabase.rpc("board_published", { p_child_id: child.id });
    return data ?? [];
  }
  if (actor.kind === "child") {
    const { data } = await createChildClient().rpc("child_session_board", { p_token: actor.session.token });
    return data ?? [];
  }
  return [];
}

/** Which Trail entries this child has offered, and where each stands. */
export async function getOffersFor(actor: AcademyActor): Promise<Map<string, BoardStatus>> {
  if (actor.kind === "parent") {
    const { supabase, child } = await requireOwnedChild(actor.childId);
    const { data } = await supabase.rpc("board_family_contributions", {});
    return new Map((data ?? []).filter((r) => r.child_id === child.id).map((r) => [r.evidence_id, r.status]));
  }
  if (actor.kind === "child") {
    const { data } = await createChildClient().rpc("child_session_board_offers", { p_token: actor.session.token });
    return new Map((data ?? []).map((r) => [r.evidence_id, r.status]));
  }
  return new Map();
}

export async function offerFor(actor: AcademyActor, evidenceId: string): Promise<void> {
  if (actor.kind === "parent") {
    const { supabase, child } = await requireOwnedChild(actor.childId);
    const { error } = await supabase.rpc("board_offer", { p_child_id: child.id, p_evidence_id: evidenceId });
    if (error) throw new Error(error.message);
    return;
  }
  if (actor.kind === "child") {
    const { error } = await createChildClient().rpc("child_session_board_offer", { p_token: actor.session.token, p_evidence_id: evidenceId });
    if (error) throw new Error(error.message);
    return;
  }
  throw new Error("not_signed_in");
}

/** The family's own contributions, for permission and withdrawal (Account). */
export async function familyContributions() {
  const { supabase } = await requireParent();
  const { data } = await supabase.rpc("board_family_contributions", {});
  return data ?? [];
}

export async function adminBoardQueue() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_board_queue", {});
  return data ?? [];
}
