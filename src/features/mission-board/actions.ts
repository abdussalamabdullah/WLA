"use server";

import { revalidatePath } from "next/cache";
import { resolveAcademyActor } from "@/features/academy/actor";
import { requireAdmin, requireParent } from "@/lib/permissions";
import { logWarn } from "@/lib/observability/logger";
import { offerFor } from "./board";

/** Offer one Trail entry. A child's offer waits for a parent; a parent's offer is the permission. */
export async function offerToBoardAction(formData: FormData): Promise<void> {
  const evidenceId = String(formData.get("evidenceId") ?? "");
  const missionSlug = String(formData.get("missionSlug") ?? "");
  const actor = await resolveAcademyActor();
  try {
    await offerFor(actor, evidenceId);
  } catch (error) {
    logWarn("board_offer_refused", { reason: error instanceof Error ? error.message.slice(0, 60) : "unknown" });
  }
  revalidatePath(`/academy/missions/${missionSlug}/trail`);
  revalidatePath("/account");
}

export async function permitBoardAction(formData: FormData): Promise<void> {
  const { supabase } = await requireParent();
  const { error } = await supabase.rpc("board_permit", { p_id: String(formData.get("id") ?? ""), p_allow: formData.get("allow") === "yes" });
  if (error) logWarn("board_permit_failed", { reason: error.message.slice(0, 60) });
  revalidatePath("/account");
}

export async function withdrawBoardAction(formData: FormData): Promise<void> {
  const { supabase } = await requireParent();
  const { error } = await supabase.rpc("board_withdraw", { p_id: String(formData.get("id") ?? "") });
  if (error) logWarn("board_withdraw_failed", { reason: error.message.slice(0, 60) });
  revalidatePath("/account");
  revalidatePath("/academy/mission-board");
}

export async function moderateBoardAction(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const action = String(formData.get("action") ?? "save") as "publish" | "reject" | "unpublish" | "save";
  const { error } = await supabase.rpc("admin_board_moderate", {
    p_id: String(formData.get("id") ?? ""),
    p_action: action,
    p_text: String(formData.get("text") ?? ""),
    p_curated: formData.get("curated") === "on",
    p_approach: String(formData.get("approach") ?? ""),
  });
  if (error) logWarn("board_moderate_failed", { reason: error.message.slice(0, 60) });
  revalidatePath("/admin/board");
  revalidatePath("/academy/mission-board");
}
