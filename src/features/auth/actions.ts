"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { logWarn } from "@/lib/observability/logger";
import { clearActiveChild } from "@/features/children/active-child";
import { safeNext, safeNextOrNull } from "@/lib/safe-next";
import {
  fieldErrorsFrom,
  newPasswordSchema,
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  type FormState,
} from "./schemas";

/**
 * AUTHENTICATION — Tech Spec §5, PRD §8.
 *
 * Supabase Auth owns authentication entirely; the application never
 * implements its own password handling (Tech Spec §5).
 *
 * The authenticated user IS the parent/guardian. `profiles` is created by the
 * `on_auth_user_created` trigger, not here, so a signup cannot half-succeed.
 *
 * Method: email + password (OPEN-04 default). Swapping to magic link would
 * change only this file and the two form components.
 */

async function originUrl(path: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}${path}`;
}

export async function signUpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  /*
   * Where they were going before they had an account — e.g. the mission they
   * chose to buy. Without one, a new account goes to add a child, as before.
   * It survives email confirmation by riding on the callback link.
   */
  const destination =
    safeNextOrNull(formData.get("next")?.toString()) ?? "/account/children";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name || null },
      emailRedirectTo: await originUrl(
        `/auth/callback?next=${encodeURIComponent(destination)}`,
      ),
    },
  });

  if (error) {
    /*
     * "Please try again" is wrong advice when retrying cannot help, so the
     * cases a parent can act on get their own message. Account existence is
     * never revealed here: `user_already_exists` stays generic.
     */
    switch (error.code) {
      case "email_address_invalid":
        return { fieldErrors: { email: "That email address can't be used. Try another." } };
      case "weak_password":
        return { fieldErrors: { password: "Choose a stronger password." } };
      case "over_email_send_rate_limit":
      case "over_request_rate_limit":
        return { error: "Too many attempts. Please wait a few minutes and try again." };
      default:
        return { error: "We couldn't create that account. Please try again." };
    }
  }

  // Email confirmation is on: no session yet, so tell them plainly rather
  // than redirecting to a page they cannot load.
  if (!data.session) {
    return {
      notice: "Check your email to confirm your account, then sign in.",
    };
  }

  redirect(destination);
}

export async function signInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    switch (error.code) {
      // One message for both wrong-email and wrong-password: naming which was
      // wrong confirms whether an account exists.
      case "invalid_credentials":
        return { error: "That email and password don't match." };
      // Only reported once the password was right, so it reveals nothing new.
      case "email_not_confirmed":
        return { error: "Confirm your email first, using the link we sent you." };
      case "over_request_rate_limit":
        return { error: "Too many attempts. Please wait a few minutes and try again." };
      // Anything else is not the parent's credentials — an outage or a
      // timeout. Telling them their password is wrong sends them to reset it.
      default:
        // OPS-01: the code and status only — never the email.
        logWarn("sign_in_failed", { code: error.code ?? "none", status: error.status ?? 0 });
        return { error: "We couldn't sign you in just now. Please try again." };
    }
  }

  redirect(safeNext(formData.get("next")?.toString()));
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // The active child belongs to the signed-out family — never carry it into
  // the next session on a shared device.
  await clearActiveChild();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: await originUrl("/auth/callback?next=/account/password"),
  });

  // Always the same response, whether or not the account exists — otherwise
  // this endpoint enumerates registered emails.
  return {
    notice:
      "If that email has an account, we've sent a link to reset the password.",
  };
}

export async function updatePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      error:
        "We couldn't update your password. The link may have expired — request a new one.",
    };
  }

  redirect("/account");
}
