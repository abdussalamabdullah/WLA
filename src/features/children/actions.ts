"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireParent, requireOwnedChild } from "@/lib/permissions";
import { childProfileSchema } from "./schemas";
import {
  setActiveChild,
  clearActiveChild,
  getActiveChildId,
} from "./active-child";
import { fieldErrorsFrom, type FormState } from "@/features/auth/schemas";
import {
  issueChildAccessCode,
  revealChildAccessCode,
} from "@/features/child-auth/issue-code";
import { safeNextOrNull } from "@/lib/safe-next";
import { logError } from "@/lib/observability/logger";

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

/**
 * What creating a child returns: the form's errors, or — once the profile
 * exists — the confirmation, including the access code when one was made.
 *
 * The code travels ONLY in this action result, exactly as with "Create a
 * code" on the profile (features/child-auth): never in a URL, a log or a
 * cached render. That is why this returns a state rather than redirecting.
 */
export type CreateChildState = FormState & {
  created?: {
    childId: string;
    name: string;
    /** Present only when a code was asked for and made. */
    code?: string;
    /** A code was asked for but could not be made; the profile still exists. */
    codeFailed?: boolean;
    /** The code can be shown again from the profile (D-143). */
    viewable?: boolean;
    /** This was a retry of an addition that had already worked (D-144). */
    alreadyAdded?: boolean;
  };
  /** Where to carry on to — e.g. back to a purchase. Already validated. */
  next?: string;
};

export async function createChildAction(
  _prev: CreateChildState,
  formData: FormData,
): Promise<CreateChildState> {
  const parsed = childProfileSchema.safeParse({
    displayName: formData.get("displayName"),
    birthYear: formData.get("birthYear"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { supabase, user } = await requireParent();

  // One key per attempt, made by the form. Not authority over anything: it is
  // unique only within this parent, and a malformed one is simply ignored.
  const key = z.string().uuid().safeParse(formData.get("creationKey"));
  const creationKey = key.success ? key.data : null;

  const { data: child, error } = await supabase
    .from("child_profiles")
    .insert({
      parent_id: user.id, // ← never taken from the form
      display_name: parsed.data.displayName,
      birth_year:
        parsed.data.birthYear === "" ? null : (parsed.data.birthYear ?? null),
      creation_key: creationKey,
    })
    .select("id, display_name")
    .single();

  /*
   * The same attempt arriving twice (D-144): answer with the profile that
   * exists. A retry NEVER makes a code, because that would revoke one the first
   * request may have just handed over. It can only show the one that exists.
   */
  if (error?.code === "23505" && creationKey) {
    const { data: existing } = await supabase
      .from("child_profiles")
      .select("id, display_name")
      .eq("parent_id", user.id)
      .eq("creation_key", creationKey)
      .maybeSingle();
    if (existing) {
      const revealed =
        formData.get("accessCode") === "on"
          ? await revealChildAccessCode(existing.id)
          : null;
      return {
        created: {
          childId: existing.id,
          name: existing.display_name,
          code: revealed && "code" in revealed ? revealed.code : undefined,
          viewable: Boolean(revealed && "code" in revealed),
          alreadyAdded: true,
        },
        next: safeNextOrNull(formData.get("next")?.toString()) ?? undefined,
      };
    }
  }

  if (error || !child) {
    return { error: "We couldn't add that profile. Please try again." };
  }

  /*
   * The access code, in the same step (D-108). Optional: a child without a
   * code is a supported state ("No code yet") and one can be made from their
   * profile at any time. Issued by the same server path as the profile's
   * "Create a code" — ownership checked here and again in the database.
   *
   * Not atomic with the insert, deliberately: if the code cannot be made the
   * profile is still worth keeping, and the confirmation says so plainly.
   */
  let code: string | undefined;
  let codeFailed = false;
  let viewable = false;
  if (formData.get("accessCode") === "on") {
    const issued = await issueChildAccessCode(child.id);
    if ("code" in issued) {
      code = issued.code;
      viewable = issued.viewable;
    } else {
      codeFailed = true;
    }
  }

  revalidatePath("/account", "layout");
  revalidatePath("/academy", "layout");
  // The two journeys that can add a child without leaving (D-144).
  revalidatePath("/purchase", "layout");
  revalidatePath("/redeem");

  return {
    created: { childId: child.id, name: child.display_name, code, codeFailed, viewable },
    next: safeNextOrNull(formData.get("next")?.toString()) ?? undefined,
  };
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

  const { error } = await supabase
    .from("child_profiles")
    .delete()
    .eq("id", child.id);

  if (error) logError("delete_child_failed", error, { childId: child.id });

  // If the removed child was selected, clear it so no screen resolves to a
  // profile that no longer exists.
  if ((await getActiveChildId()) === child.id) {
    await clearActiveChild();
  }

  revalidatePath("/account/children");
  revalidatePath("/academy", "layout");
  redirect("/account/children");
}
