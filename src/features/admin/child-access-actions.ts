"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions";
import { logWarn } from "@/lib/observability/logger";

export type AdminCodeState = { error?: string; done?: boolean };

/**
 * An administrator may REVOKE a child's access code, and may not generate one.
 *
 * Brief §20 says "revoke/regenerate where appropriate"; only revoke is
 * implemented from this surface, deliberately. Generating produces a secret
 * that has to reach the child, and the only person who can hand it over is the
 * parent. An admin-generated code would either be shown to the wrong person or
 * be useless. Revoking needs no such delivery and is the half that matters for
 * support: turning off a code that has gone astray.
 */
export async function adminRevokeChildCodeAction(
  _prev: AdminCodeState,
  formData: FormData,
): Promise<AdminCodeState> {
  const childId = String(formData.get("childId") ?? "");

  let supabase;
  try {
    ({ supabase } = await requireAdmin());
  } catch {
    return { error: "Not permitted." };
  }

  const { error } = await supabase.rpc("revoke_child_access_code", {
    p_child_id: childId,
  });

  if (error) {
    logWarn("admin_revoke_code_failed", { childId, reason: error.message });
    return { error: "Couldn't turn that code off." };
  }

  revalidatePath("/admin/children");
  return { done: true };
}
