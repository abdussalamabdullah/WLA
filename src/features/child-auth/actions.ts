"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createChildClient,
  setChildSession,
  clearChildSession,
  getChildToken,
} from "@/lib/child-session";
import { logWarn } from "@/lib/observability/logger";

/**
 * CHILD SIGN-IN — D-58.
 *
 * The only credential handling anywhere in the application, and it is
 * deliberately thin: the code is passed straight to `redeem_child_code`, which
 * hashes, compares, rate-limits and mints the session inside the database.
 * Nothing here compares a secret, and nothing here decides whether the code
 * was right.
 *
 * The code is never logged, never returned in a form state, and never placed
 * in a URL.
 */

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter your child code.")
    // Formatting is forgiving on purpose: a child typing "g3mam872" or
    // "G3MA M872" has entered the right code. The database normalises it the
    // same way before hashing.
    .refine((v) => v.replace(/[^A-Za-z0-9]/g, "").length === 8, {
      message: "A child code has 8 letters and numbers, like ABCD-2345.",
    }),
});

export type ChildLoginState = { error?: string };

export async function childLoginAction(
  _prev: ChildLoginState,
  formData: FormData,
): Promise<ChildLoginState> {
  const parsed = codeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter your child code." };
  }

  const supabase = createChildClient();
  const { data, error } = await supabase.rpc("redeem_child_code", {
    p_code: parsed.data.code,
  });

  if (error) {
    // Never include the submitted code — logger redaction would catch a
    // credential-shaped key, but the call site is the real protection.
    logWarn("child_login_rpc_failed", { reason: error.message });
    return { error: "We couldn't check that code. Please try again." };
  }

  const row = Array.isArray(data) ? data[0] : null;

  if (!row || row.outcome === "rate_limited") {
    return {
      error: "Too many tries. Wait a few minutes, then try again.",
    };
  }

  if (row.outcome !== "ok" || !row.token || !row.expires_at) {
    // One message for wrong, revoked and expired: the form must not become a
    // way to find out which codes exist.
    return { error: "That code didn't work. Check it and try again." };
  }

  await setChildSession(row.token, row.expires_at);
  redirect("/academy/my-missions");
}

export async function childLogoutAction() {
  const token = await getChildToken();
  if (token) {
    const supabase = createChildClient();
    // Revoke server-side as well as dropping the cookie, so a copied cookie is
    // dead too. Logging out must not be only a client-side gesture.
    await supabase.rpc("revoke_child_session", { p_token: token });
  }
  await clearChildSession();
  revalidatePath("/academy", "layout");
  redirect("/child/login");
}
