import "server-only";

import Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnedChild, requireParent } from "@/lib/permissions";
import type { ChildProfileRow, MissionRow } from "@/types/database";

/**
 * STRIPE CHECKOUT — Sprint 8.
 *
 * Flow: Public Mission → purchase → Stripe Checkout → verified webhook →
 * child entitlement → My Missions → Mission Home.
 *
 * The browser never supplies a price, a currency or an unverified child.
 * Everything chargeable is read from the database at session-creation time.
 */

export class CheckoutError extends Error {
  constructor(
    message: string,
    readonly reason:
      "not_purchasable" | "already_owned" | "free_mission" | "provider",
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

let stripeClient: Stripe | null = null;
export function stripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(serverEnv().STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

/**
 * THE SINGLE ACQUISITION ENTRY POINT.
 *
 * The browser submits a mission and a child. It does NOT say how the mission
 * should be acquired, and it cannot: whether a mission is free or paid is read
 * from the mission row here, server-side. A client that claimed a paid mission
 * was free would simply be ignored, because its claim is never read.
 *
 * Validation order mirrors Tech Spec §25:
 *   1. authenticated parent
 *   2. the child belongs to that parent   ← never trust the submitted id
 *   3. the mission is published
 *   4. the child does not already hold it (idempotent either way)
 *   5. THEN the server decides: free → grant directly, paid → Stripe
 *
 * D-10: free access is an entitlement source, not a separate architecture.
 * Both paths end at the same `mission_entitlements` row.
 */
export async function acquireMission({
  childId,
  missionSlug,
  origin,
}: {
  childId: string;
  missionSlug: string;
  origin: string;
}): Promise<{ kind: "granted" } | { kind: "checkout"; url: string }> {
  const { user } = await requireParent();

  // Step 2 — ownership. Throws AccessError if the child is not this parent's.
  const { child, supabase } = await requireOwnedChild(childId);

  const { data: mission } = await supabase
    .from("missions")
    .select("*")
    .eq("slug", missionSlug)
    .eq("published", true)
    .maybeSingle();

  if (!mission) {
    throw new CheckoutError("That mission isn't available.", "not_purchasable");
  }

  // Step 4 — already owned. Idempotent for both free and paid: asking twice
  // is a no-op, not an error and not a second charge.
  const { data: existing } = await supabase
    .from("mission_entitlements")
    .select("id")
    .eq("child_id", child.id)
    .eq("mission_id", mission.id)
    .eq("status", "active")
    .maybeSingle();

  if (existing) {
    return { kind: "granted" };
  }

  // Step 5 — the server decides, from the mission row.
  if (mission.is_free) {
    await grantFreeEntitlement(child.id, mission.id);
    return { kind: "granted" };
  }

  return {
    kind: "checkout",
    url: (await createCheckoutSession({ child, mission, user, origin })).url,
  };
}

/**
 * Grant a free mission.
 *
 * Service-role because `mission_entitlements` has no client insert policy —
 * the same boundary that stops a browser granting itself a paid mission also
 * stops it granting a free one. Free access still has to be decided by the
 * server.
 *
 * Idempotent via `unique (child_id, mission_id)`, so a double submit or a
 * retried request cannot create a duplicate.
 */
async function grantFreeEntitlement(
  childId: string,
  missionId: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .from("mission_entitlements")
    .upsert(
      {
        child_id: childId,
        mission_id: missionId,
        source: "free",
        status: "active",
      },
      { onConflict: "child_id,mission_id", ignoreDuplicates: true },
    );

  if (error) {
    throw new CheckoutError(
      "We couldn't add that mission. Please try again.",
      "provider",
    );
  }
}

/**
 * Create a Stripe Checkout session. Internal — reached only via
 * `acquireMission`, which has already run steps 1–4.
 *
 * The amount comes from the mission row; a price submitted by the browser is
 * ignored because it is never read.
 */
async function createCheckoutSession({
  child,
  mission,
  user,
  origin,
}: {
  child: ChildProfileRow;
  mission: MissionRow;
  user: { id: string; email?: string };
  origin: string;
}): Promise<{ url: string }> {
  // A free mission must never reach Stripe. Unreachable via acquireMission,
  // asserted here so a future caller cannot bypass the decision.
  if (mission.is_free) {
    throw new CheckoutError(
      "This mission is free — it doesn't need a payment.",
      "free_mission",
    );
  }

  // SERVER-SIDE PRICE VALIDATION. Amount and currency come from the mission
  // row; nothing chargeable originates in the browser.
  if (!mission.price_minor || mission.price_minor <= 0) {
    throw new CheckoutError(
      "That mission isn't available to buy right now.",
      "not_purchasable",
    );
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: mission.currency.toLowerCase(), // GBP, from the mission
            unit_amount: mission.price_minor,
            product_data: {
              name: mission.title,
              // No child name — the receipt is the parent's, and Stripe is a
              // third party (Brief §46).
              description: mission.description ?? undefined,
            },
          },
        },
      ],
      customer_email: user.email,
      success_url: `${origin}/academy/my-missions?purchase=complete`,
      cancel_url: `${origin}/purchase/${mission.slug}?cancelled=1`,
      // Metadata is a convenience for the webhook; checkout_intents is the
      // authoritative record of who this was for.
      metadata: {
        child_id: child.id,
        mission_id: mission.id,
        parent_id: user.id,
      },
    });
  } catch {
    throw new CheckoutError(
      "We couldn't start the payment. Please try again.",
      "provider",
    );
  }

  if (!session.url) {
    throw new CheckoutError("We couldn't start the payment.", "provider");
  }

  /*
   * Record the intent server-side BEFORE the parent leaves for Stripe. The
   * webhook resolves the child from HERE, so tampered metadata cannot redirect
   * an entitlement to another child.
   *
   * Service-role because the table is deliberately client-unwritable.
   */
  await createAdminClient().from("checkout_intents").insert({
    stripe_session_id: session.id,
    parent_id: user.id,
    child_id: child.id,
    mission_id: mission.id,
    amount_minor: mission.price_minor,
    currency: mission.currency,
  });

  return { url: session.url };
}
