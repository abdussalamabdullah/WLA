import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The Stripe webhook, run — not read. Signature verification and the database
 * are stubbed; we assert what the route does when resolving the purchase's
 * intent: a failed lookup must be retried (500, claim released), never
 * swallowed as "no intent" (200), which would keep the payment and grant
 * nothing.
 */

type Row = Record<string, unknown>;
const state: {
  intent: { data: Row | null; error: { message: string } | null };
  deletedEvents: string[];
  entitlements: Row[];
} = { intent: { data: null, error: null }, deletedEvents: [], entitlements: [] };

vi.mock("@/lib/env", () => ({
  stripeEnv: () => ({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" }),
}));
vi.mock("@/features/commerce/checkout", () => ({
  stripe: () => ({
    webhooks: { constructEvent: (payload: string) => JSON.parse(payload) },
  }),
}));
vi.mock("@/lib/email/send", () => ({ sendMissionAccessEmail: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.insert = async () => ({ error: null }); // the event claim
      q.select = () => q;
      q.eq = (_col: string, value: string) => {
        if (q.deleting) state.deletedEvents.push(value);
        return q;
      };
      q.maybeSingle = async () =>
        table === "checkout_intents" ? state.intent : { data: null, error: null };
      q.delete = () => {
        q.deleting = true;
        return q;
      };
      q.upsert = async (row: Row) => {
        state.entitlements.push(row);
        return { error: null };
      };
      return q;
    },
  }),
}));

const { POST } = await import("../route");

function deliver() {
  const event = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        payment_status: "paid",
        amount_total: 1200,
        currency: "gbp",
        payment_intent: "pi_1",
      },
    },
  };
  return POST(
    new Request("https://academy.example/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=x" },
      body: JSON.stringify(event),
    }),
  );
}

beforeEach(() => {
  state.intent = { data: null, error: null };
  state.deletedEvents = [];
  state.entitlements = [];
});

describe("resolving the checkout intent", () => {
  it("a failed lookup releases the claim and asks Stripe to retry", async () => {
    state.intent = { data: null, error: { message: "timeout" } };
    const res = await deliver();
    expect(res.status).toBe(500);
    expect(state.deletedEvents).toEqual(["evt_1"]);
    expect(state.entitlements).toEqual([]);
  });

  it("a genuinely missing intent is acknowledged and grants nothing", async () => {
    const res = await deliver();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ unmatched: true });
    expect(state.deletedEvents).toEqual([]);
    expect(state.entitlements).toEqual([]);
  });

  it("a recorded intent grants exactly that child the mission", async () => {
    state.intent = {
      data: { child_id: "child-1", mission_id: "m-1", amount_minor: 1200, currency: "GBP" },
      error: null,
    };
    const res = await deliver();
    expect(res.status).toBe(200);
    expect(state.entitlements).toEqual([
      expect.objectContaining({ child_id: "child-1", mission_id: "m-1", source: "purchase" }),
    ]);
  });
});
