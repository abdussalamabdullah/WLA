"use server";

import { revalidatePath } from "next/cache";
import { requireOwnedChild } from "@/lib/permissions";
import { logWarn } from "@/lib/observability/logger";
import { issueChildAccessCode } from "./issue-code";

/**
 * Parent-side management of a child's access code — brief §4, §5.
 *
 * REVEAL MEANS "SEE WHAT WAS JUST MADE", NOT "READ IT BACK".
 *
 * Only a bcrypt hash and a keyed lookup digest are stored, so there is nothing
 * to read back. A parent who loses the code makes a new one. That is a
 * deliberate cost: the alternative is storing something recoverable, which
 * would make the credential table worth stealing.
 *
 * The code is returned once, in the action result, and is never written to a
 * log, a URL, a revalidated cache entry or the database in plaintext.
 */

export type ChildCodeState = {
  code?: string;
  error?: string;
  revoked?: boolean;
};

export async function generateChildCodeAction(
  _prev: ChildCodeState,
  formData: FormData,
): Promise<ChildCodeState> {
  const childId = String(formData.get("childId") ?? "");

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
  return { code: issued.code };
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
