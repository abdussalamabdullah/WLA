"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireParent, requireOwnedChild } from "@/lib/permissions";
import { childProfileSchema } from "./schemas";
import {
  setActiveChild,
  clearActiveChild,
  getActiveChildId,
} from "./active-child";
import { fieldErrorsFrom, type FormState } from "@/features/auth/schemas";

/**
 * Switch the active child.
 *
 * Client requirement (2026-09-25): when the parent switches child, the ENTIRE
 * Academy context switches with them — My Missions, mission status, Mission
 * Home, Active Mission, Mission Trail and mission-specific state. There must
 * be no possibility of showing Child A's data while Child B is selected.
 *
 * Two mechanisms guarantee that:
 *
 *   1. `revalidatePath("/academy", "layout")` discards every cached Academy
 *      render beneath the Academy layout, so no previously-rendered screen can
 *      survive the switch.
 *   2. Nothing is keyed on the active child alone. Every query re-validates
 *      ownership server-side (lib/permissions), so even a stale render could
 *      not fetch the wrong child's data.
 *
 * `setActiveChild` verifies ownership before writing the cookie, so an
 * unowned id never becomes active in the first place.
 */
export async function switchActiveChildAction(childId: string) {
  await setActiveChild(childId);
  revalidatePath("/academy", "layout");
}

export async function clearActiveChildAction() {
  await clearActiveChild();
  revalidatePath("/academy", "layout");
}

export async function createChildAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = childProfileSchema.safeParse({
    displayName: formData.get("displayName"),
    birthYear: formData.get("birthYear"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { supabase, user } = await requireParent();

  const { error } = await supabase.from("child_profiles").insert({
    parent_id: user.id, // ← never taken from the form
    display_name: parsed.data.displayName,
    birth_year:
      parsed.data.birthYear === "" ? null : (parsed.data.birthYear ?? null),
  });

  if (error) {
    return { error: "We couldn't add that profile. Please try again." };
  }

  revalidatePath("/account/children");
  revalidatePath("/academy", "layout");
  redirect("/account/children");
}

export async function updateChildAction(
  childId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = childProfileSchema.safeParse({
    displayName: formData.get("displayName"),
    birthYear: formData.get("birthYear"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  // Ownership first — the id came from the browser.
  const { child, supabase } = await requireOwnedChild(childId);

  const { error } = await supabase
    .from("child_profiles")
    .update({
      display_name: parsed.data.displayName,
      birth_year:
        parsed.data.birthYear === "" ? null : (parsed.data.birthYear ?? null),
    })
    .eq("id", child.id);

  if (error) {
    return { error: "We couldn't save those changes. Please try again." };
  }

  revalidatePath("/account/children");
  revalidatePath("/academy", "layout");
  redirect("/account/children");
}

/**
 * Removing a child profile deletes their mission progress, responses and
 * evidence by cascade. The confirmation dialog says so in plain words — this
 * is not recoverable, and mission_evidence is the child's Mission Trail.
 */
export async function deleteChildAction(childId: string) {
  const { child, supabase } = await requireOwnedChild(childId);

  await supabase.from("child_profiles").delete().eq("id", child.id);

  // If the removed child was selected, clear it so no screen resolves to a
  // profile that no longer exists.
  if ((await getActiveChildId()) === child.id) {
    await clearActiveChild();
  }

  revalidatePath("/account/children");
  revalidatePath("/academy", "layout");
  redirect("/account/children");
}
