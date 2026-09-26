"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { clearActiveChild } from "@/features/children/active-child";
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

/**
 * Only same-origin relative paths may be used as a post-login destination.
 * Rejects `//evil.com` and absolute URLs — otherwise `?next=` is an open
 * redirect.
 */
function safeNext(next: string | null | undefined): string {
  if (!next) return "/academy/my-missions";
  if (!next.startsWith("/") || next.startsWith("//")) {
    return "/academy/my-missions";
  }
  return next;
}

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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name || null },
      emailRedirectTo: await originUrl("/auth/callback?next=/account/children"),
    },
  });

  if (error) {
    return { error: "We couldn't create that account. Please try again." };
  }

  // Email confirmation is on: no session yet, so tell them plainly rather
  // than redirecting to a page they cannot load.
  if (!data.session) {
    return {
      notice: "Check your email to confirm your account, then sign in.",
    };
  }

  redirect("/account/children");
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
    // One message for both wrong-email and wrong-password: naming which was
    // wrong confirms whether an account exists.
    return { error: "That email and password don't match." };
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
