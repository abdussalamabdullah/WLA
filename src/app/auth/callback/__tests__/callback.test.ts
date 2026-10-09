import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * The email-confirmation landing, run — not read. Sign-up now sends the
 * confirmation link back here with `next` (e.g. the mission being bought), so
 * this is the step that returns a newly confirmed parent to their purchase.
 * Supabase is stubbed; the real exchange needs a real email link.
 */
let exchange: { error: unknown };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: async () => exchange } }),
}));
const { GET } = await import("../route");
const go = (qs: string) => GET(new NextRequest(new URL(`/auth/callback${qs}`, "http://localhost")));
const loc = (r: Response) => r.headers.get("location");

beforeEach(() => {
  exchange = { error: null };
});

describe("email confirmation returns the parent to where they were going", () => {
  it("a confirmed sign-up from a purchase lands back on the purchase", async () => {
    expect(loc(await go(`?code=c&next=${encodeURIComponent("/purchase/mars-bridge")}`))).toBe("http://localhost/purchase/mars-bridge");
  });
  it("a plain sign-up still lands on adding a child", async () => {
    expect(loc(await go(`?code=c&next=${encodeURIComponent("/account/children")}`))).toBe("http://localhost/account/children");
  });
  it("a hostile next is not followed", async () => {
    for (const next of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      expect(loc(await go(`?code=c&next=${encodeURIComponent(next)}`))).toBe("http://localhost/academy/my-missions");
    }
  });
  it("an expired link goes to sign in with a reason, not to the purchase", async () => {
    exchange = { error: { message: "expired" } };
    expect(loc(await go(`?code=c&next=${encodeURIComponent("/purchase/mars-bridge")}`))).toBe("http://localhost/login?error=link_expired");
  });
  it("no code: link_invalid", async () => {
    expect(loc(await go(`?next=${encodeURIComponent("/purchase/mars-bridge")}`))).toBe("http://localhost/login?error=link_invalid");
  });
});
