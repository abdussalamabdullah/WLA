"use server";

import { revalidatePath } from "next/cache";
import { requireOwnedChild } from "@/lib/permissions";
import { logWarn } from "@/lib/observability/logger";
import { REPLACE_TO_VIEW } from "./copy";
import { issueChildAccessCode, revealChildAccessCode } from "./issue-code";

/**
 * Parent-side management of a child's access code — brief §4, §5, D-143.
 *
 * Sign-in verifies a bcrypt hash and a keyed lookup digest. A separate encrypted
 * copy lets the parent see the active code again; a code made before that copy
 * existed can only be replaced.
 *
 * A code travels only in an action result, never in a log, a URL, a revalidated
 * cache entry or the database in plaintext. It is not in the page's HTML either:
 * the page knows only whether "Show access code" can work.
 */

export type ChildCodeState = {
  code?: string;
  error?: string;
  revoked?: boolean;
  /** This code can be shown again from the profile. */
  viewable?: boolean;
  /** The code on screen is a new one, just made. */
  replaced?: boolean;
  /** The active code has no copy to show. */
  notViewable?: boolean;
};

export async function generateChildCodeAction(
  _prev: ChildCodeState,
  formData: FormData,
): Promise<ChildCodeState> {
  const childId = String(formData.get("childId") ?? "");

  // Replacing ends the child's sessions, so it needs the explicit confirmation.
  let hadCode = false;
  try {
    const { supabase } = await requireOwnedChild(childId);
    const { data, error } = await supabase
      .from("child_access_credentials")
      .select("id")
      .eq("child_id", childId)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw error;
    hadCode = Boolean(data);
  } catch {
    return { error: "That child profile does not belong to this account." };
  }
  if (hadCode && formData.get("confirmReplace") !== "yes") {
    return { error: "Please confirm that you want to replace this code." };
  }

  // The family boundary is asserted inside, and again by the RPC.
  const issued = await issueChildAccessCode(childId);
  if ("error" in issued) {
    return {
      error:
        issued.error === "not_owned"
          ? "That child profile does not belong to this account."
          : "We couldn't make a code just now. Please try again.",
    };
  }

  revalidatePath(`/account/children/${childId}`);
  return { code: issued.code, viewable: issued.viewable, replaced: hadCode };
}

export async function revealChildCodeAction(
  _prev: ChildCodeState,
  formData: FormData,
): Promise<ChildCodeState> {
  const revealed = await revealChildAccessCode(String(formData.get("childId") ?? ""));
  if ("code" in revealed) return { code: revealed.code, viewable: true };
  switch (revealed.error) {
    case "not_owned":
      return { error: "That child profile does not belong to this account." };
    case "no_copy":
      return { error: REPLACE_TO_VIEW, notViewable: true };
    case "unreadable":
      return {
        error: `We can't show this code right now. The code itself still works. ${REPLACE_TO_VIEW}`,
        notViewable: true,
      };
    default:
      return { error: "We couldn't show the code just now. Please try again." };
  }
}

export async function revokeChildCodeAction(
  _prev: ChildCodeState,
  formData: FormData,
): Promise<ChildCodeState> {
  const childId = String(formData.get("childId") ?? "");

  let supabase;
  try {
    ({ supabase } = await requireOwnedChild(childId));
  } catch {
    return { error: "That child profile does not belong to this account." };
  }

  const { error } = await supabase.rpc("revoke_child_access_code", {
    p_child_id: childId,
  });

  if (error) {
    logWarn("child_code_revoke_failed", { childId, reason: error.message });
    return { error: "We couldn't turn that code off. Please try again." };
  }

  revalidatePath(`/account/children/${childId}`);
  return { revoked: true };
}
