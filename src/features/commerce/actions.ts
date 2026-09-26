"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { acquireMission, CheckoutError } from "./checkout";
import { AccessError } from "@/lib/permissions";
import type { FormState } from "@/features/auth/schemas";

/**
 * Acquire a mission for a child.
 *
 * ONE action for free and paid. The browser submits a mission and a child and
 * nothing else — it does not say, and cannot say, how the mission should be
 * acquired. The server reads `is_free` from the mission row and routes
 * accordingly:
 *
 *   free → entitlement granted directly, back to My Missions
 *   paid → Stripe Checkout, entitlement created by the verified webhook
 *
 * The child is verified against the authenticated parent before either path
 * runs (`requireOwnedChild`), so a submitted id belonging to another family
 * reaches neither Stripe nor a free grant.
 */
export async function acquireMissionAction(
  missionSlug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const childId = formData.get("childId")?.toString();
  if (!childId) {
    return { error: "Choose who this mission is for." };
  }

  let result: Awaited<ReturnType<typeof acquireMission>>;
  try {
    result = await acquireMission({
      childId,
      missionSlug,
      origin: await requestOrigin(),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      // Same message whichever way it failed — do not confirm whether some
      // other family's child id exists.
      return { error: "Choose who this mission is for." };
    }
    if (error instanceof CheckoutError) {
      return { error: error.message };
    }
    return { error: "We couldn't add that mission. Please try again." };
  }

  // Outside the try: redirect() throws by design.
  if (result.kind === "granted") {
    revalidatePath("/academy/my-missions");
    redirect("/academy/my-missions?added=1");
  }

  redirect(result.url);
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
