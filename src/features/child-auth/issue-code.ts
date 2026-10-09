import "server-only";

import { requireOwnedChild } from "@/lib/permissions";
import { logWarn } from "@/lib/observability/logger";

/**
 * Issue (or reissue) a child's access code — the one mechanism, shared by the
 * profile's "Create a code" and by creating a child with a code (D-108).
 *
 * Deliberately NOT in a "use server" file: every export of one becomes a
 * callable endpoint, and this is a building block for actions that have their
 * own entry checks, not an action itself.
 *
 * The family boundary is asserted here and again inside
 * `generate_child_access_code`, which compares the child's parent to
 * `auth.uid()`. The code is generated, hashed and stored in the database; this
 * only carries the plaintext back once, for the parent to see. It is never
 * logged, put in a URL or cached.
 */
export async function issueChildAccessCode(
  childId: string,
): Promise<{ code: string } | { error: "not_owned" | "failed" }> {
  let supabase;
  try {
    ({ supabase } = await requireOwnedChild(childId));
  } catch {
    return { error: "not_owned" };
  }

  const { data, error } = await supabase.rpc("generate_child_access_code", {
    p_child_id: childId,
  });

  if (error || !data) {
    logWarn("child_code_generate_failed", { childId, reason: error?.message });
    return { error: "failed" };
  }

  return { code: data as unknown as string };
}
