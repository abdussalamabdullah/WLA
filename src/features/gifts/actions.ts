"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { CheckoutError } from "@/features/commerce/checkout";
import { setActiveChild } from "@/features/children/active-child";
import type { FormState } from "@/features/auth/schemas";
import { logError } from "@/lib/observability/logger";
import { AccessError, requireOwnedChild, requireParent } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { purchaseGift } from "./checkout";
import { GIFT_CLAIM_COOKIE, GIFT_CLAIM_COOKIE_PATH, GIFT_CLAIM_SECONDS, GIFT_REDEEM_PATH } from "./claim";
import { emailLinksFor } from "./fulfil";
import { confirmGiftEmail } from "./redeem";
import { confirmEmailSchema, recipientEmailSchema } from "./schemas";
import { hashGiftToken, looksLikeGiftToken, normaliseGiftEmail } from "./token";

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/** "Give as a gift?" on the purchase page: on to Stripe, granting nothing. */
export async function giftMissionAction(
  missionSlug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = recipientEmailSchema.safeParse(formData.get("recipientEmail") ?? "");
  if (!parsed.success) {
    return { fieldErrors: { recipientEmail: parsed.error.issues[0]?.message ?? "Enter a valid email address." } };
  }

  let result: Awaited<ReturnType<typeof purchaseGift>>;
  try {
    result = await purchaseGift({
      missionSlug,
      recipientEmail: parsed.data,
      origin: await requestOrigin(),
    });
  } catch (error) {
    if (error instanceof CheckoutError) return { error: error.message };
    if (error instanceof AccessError) return { error: "Please sign in again to continue." };
    logError("gift_purchase_failed", error, { missionSlug });
    return { error: "We couldn't start the payment. Please try again." };
  }

  // Outside the try: redirect() throws by design.
  if (result.kind === "processing") redirect("/gift?purchase=success");
  redirect(result.url);
}

/**
 * The redemption page's one question: "Confirm your email".
 *
 * With a link, the token and the address must both match. Only then does the
 * browser get a claim cookie (D-142), and the token leaves the URL.
 *
 * Without a link (the website's "Redeem a Gift"), the same form emails a link to
 * that address and always gives the same answer, so it can't be used to find out
 * who has been given a gift or who has an account. The work runs after the
 * response, so its timing can't tell either.
 */
export async function confirmGiftEmailAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = confirmEmailSchema.safeParse(formData.get("email") ?? "");
  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0]?.message ?? "Enter a valid email address." } };
  }

  const token = formData.get("token")?.toString() ?? "";

  if (!token) {
    const email = normaliseGiftEmail(parsed.data);
    after(() => emailLinksFor(createAdminClient(), email));
    return {
      notice:
        "If a gift was sent to that address, we've emailed it a link to redeem it. Please check your inbox.",
    };
  }

  let check: Awaited<ReturnType<typeof confirmGiftEmail>>;
  try {
    check = await confirmGiftEmail(token, parsed.data);
  } catch (error) {
    logError("gift_confirm_failed", error);
    return { error: "We couldn't check that just now. Please try again." };
  }

  if (check.outcome === "mismatch") {
    return {
      error:
        "That isn't the email address this gift was sent to. Check the address and try again.",
    };
  }
  if (check.outcome === "already_redeemed") {
    return { error: "This gift has already been redeemed." };
  }
  if (check.outcome === "invalid") {
    return {
      error:
        "This gift link isn't valid any more. Choose Redeem a Gift on our website and enter your email address to get a new one.",
    };
  }

  (await cookies()).set(GIFT_CLAIM_COOKIE, check.claim, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: GIFT_CLAIM_COOKIE_PATH,
    maxAge: GIFT_CLAIM_SECONDS,
  });
  redirect(GIFT_REDEEM_PATH);
}

/** Turn a confirmed claim into the chosen child's entitlement. */
export async function redeemGiftAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const jar = await cookies();
  const claim = jar.get(GIFT_CLAIM_COOKIE)?.value;
  if (!looksLikeGiftToken(claim)) {
    return { error: "Please confirm your email address again." };
  }
  const childId = formData.get("childId")?.toString();
  if (!childId) return { error: "Choose who this mission is for." };

  let userId: string;
  try {
    const { user } = await requireParent();
    userId = user.id;
    await requireOwnedChild(childId); // never trust the submitted id
  } catch (error) {
    if (error instanceof AccessError) return { error: "Choose who this mission is for." };
    throw error;
  }

  const { data: outcome, error } = await createAdminClient().rpc("redeem_mission_gift", {
    p_claim_hash: hashGiftToken(claim),
    p_child_id: childId,
    p_parent_id: userId,
  });
  if (error) {
    logError("gift_redeem_failed", error);
    return { error: "We couldn't redeem that gift. Please try again." };
  }

  switch (outcome) {
    case "redeemed":
      break;
    case "already_owned":
      return {
        error: "That child already has this mission. Choose another child, or add a profile.",
      };
    case "already_redeemed":
      jar.delete({ name: GIFT_CLAIM_COOKIE, path: GIFT_CLAIM_COOKIE_PATH });
      return { error: "This gift has already been redeemed." };
    case "forbidden":
      return { error: "Choose who this mission is for." };
    case "unavailable":
      return { error: "This mission can't be added for that child. Choose another child." };
    default:
      // The claim no longer leads anywhere, so don't leave them stuck on it.
      jar.delete({ name: GIFT_CLAIM_COOKIE, path: GIFT_CLAIM_COOKIE_PATH });
      return { error: "Please confirm your email address again." };
  }

  jar.delete({ name: GIFT_CLAIM_COOKIE, path: GIFT_CLAIM_COOKIE_PATH });
  await setActiveChild(childId).catch(() => {});
  revalidatePath("/academy", "layout");
  redirect("/academy/my-missions?added=1");
}
