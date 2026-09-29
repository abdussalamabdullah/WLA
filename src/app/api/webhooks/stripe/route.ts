import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripeEnv } from "@/lib/env";
import { stripe } from "@/features/commerce/checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMissionAccessEmail } from "@/lib/email/send";
import { logError, logWarn } from "@/lib/observability/logger";

/**
 * THE ENTITLEMENT BOUNDARY — Tech Spec §40.
 *
 * "The Academy should NOT trust a frontend success message as proof of
 *  payment. The actual payment provider webhook/server verification should
 *  determine whether an entitlement is created."
 *
 * This route is the ONLY path that creates an entitlement with source
 * 'purchase'. The browser cannot create one: `mission_entitlements` has a
 * single RLS policy and it is `for select`.
 *
 * Idempotency is layered, because Stripe retries on any non-2xx and may
 * deliver the same event more than once even after a success:
 *
 *   1. `stripe_events` — the event id is a primary key, so recording it IS
 *      the lock. A duplicate delivery loses the insert race and exits before
 *      doing any work.
 *   2. `unique (child_id, mission_id)` on mission_entitlements — even if both
 *      layers above were bypassed, a second grant is a no-op.
 */

export const runtime = "nodejs"; // raw body required for signature verification

export async function POST(request: Request) {
  const env = stripeEnv();

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Must be the raw body — parsing it first breaks verification.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    // Never echo the underlying error — it leaks verification detail.
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  /*
   * Claim the event. The primary key makes this the idempotency lock: a
   * duplicate delivery fails the insert and returns without side effects.
   *
   * Claiming BEFORE the work (rather than marking after) is deliberate —
   * two concurrent deliveries cannot both proceed. The cost is that a crash
   * mid-processing would leave the event claimed but unapplied; the unique
   * constraint on entitlements plus Stripe's dashboard replay covers that,
   * and a double grant is the worse failure.
   */
  const { error: claimError } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });

  if (claimError) {
    // Already processed. 200 so Stripe stops retrying.
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;

  // Only a genuinely paid session grants access. An unpaid or expired session
  // must never create an entitlement.
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, unpaid: true });
  }

  /*
   * Resolve the intended child from OUR record, not from Stripe metadata.
   * The intent row was written server-side before the parent left for
   * Checkout, so it cannot have been influenced by the browser.
   */
  const { data: intent } = await admin
    .from("checkout_intents")
    .select("child_id, mission_id, amount_minor, currency")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (!intent) {
    // A gift purchase has no child yet — it creates a gift record instead,
    // redeemed later (Tech Spec §41). Not yet implemented: gift flow.
    // OPS-01. A gift purchase legitimately has no intent yet, so this is a
    // warning rather than an error — but it must still be visible.
    logWarn("stripe_no_checkout_intent", { sessionId: session.id });
    return NextResponse.json({ received: true, unmatched: true });
  }

  // Reconciliation: what Stripe collected must match what we recorded.
  if (
    session.amount_total !== intent.amount_minor ||
    session.currency?.toUpperCase() !== intent.currency.toUpperCase()
  ) {
    // A reconciliation failure is the one webhook outcome that should always
    // be looked at: it means Stripe collected something other than what we
    // recorded. No entitlement is created.
    logError(
      "stripe_amount_mismatch",
      new Error("amount or currency mismatch"),
      {
        sessionId: session.id,
        expected: `${intent.amount_minor} ${intent.currency}`,
        received: `${session.amount_total} ${session.currency}`,
      },
    );
    return NextResponse.json({ received: true, mismatch: true });
  }

  // Service-role: the purchaser may not have an active session right now.
  const { error } = await admin.from("mission_entitlements").upsert(
    {
      child_id: intent.child_id,
      mission_id: intent.mission_id,
      source: "purchase",
      status: "active",
      stripe_payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null,
    },
    { onConflict: "child_id,mission_id", ignoreDuplicates: true },
  );

  if (error) {
    logError("stripe_entitlement_failed", error, { sessionId: session.id });
    // Release the claim so Stripe's retry can genuinely re-run this.
    await admin.from("stripe_events").delete().eq("id", event.id);
    // 500 so Stripe retries — a dropped entitlement means a paying family
    // cannot reach the mission they bought.
    return NextResponse.json({ error: "Entitlement failed" }, { status: 500 });
  }

  /*
   * Confirm access by email (D-27).
   *
   * Strictly after the entitlement exists, and deliberately not awaited into
   * the success path: sendMissionAccessEmail never throws, and a send failure
   * must not turn a completed purchase into a 500 that Stripe retries. The
   * entitlement is the thing that matters; the email is a courtesy.
   */
  await notifyAccessGranted(admin, intent.child_id, intent.mission_id);

  return NextResponse.json({ received: true });
}

/**
 * Look up the details the confirmation email needs and send it.
 *
 * Service-role, because the purchaser has no active session at this moment.
 * Any failure is logged and swallowed — see the call site.
 */
async function notifyAccessGranted(
  admin: ReturnType<typeof createAdminClient>,
  childId: string,
  missionId: string,
): Promise<void> {
  try {
    const [{ data: child }, { data: mission }] = await Promise.all([
      admin
        .from("child_profiles")
        .select("display_name, parent_id")
        .eq("id", childId)
        .maybeSingle(),
      admin
        .from("missions")
        .select("title, slug")
        .eq("id", missionId)
        .maybeSingle(),
    ]);

    if (!child || !mission) return;

    const { data: parent } = await admin
      .from("profiles")
      .select("email")
      .eq("id", child.parent_id)
      .maybeSingle();

    if (!parent?.email) return;

    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "";

    await sendMissionAccessEmail({
      to: parent.email,
      childName: child.display_name,
      missionTitle: mission.title,
      missionUrl: `${origin}/academy/missions/${mission.slug}`,
    });
  } catch (err) {
    // The purchase already succeeded; the email is a courtesy.
    logWarn("stripe_access_email_failed", {
      reason: err instanceof Error ? err.message : "unknown",
    });
  }
}
