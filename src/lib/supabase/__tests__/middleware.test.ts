import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * Found in staging browser QA: a signed-in parent was redirected to /login
 * mid-session whenever the auth service timed out, because a FAILED session
 * check was read as "no user". Behavioural — updateSession runs against a
 * stubbed Supabase client and we inspect the response it returns.
 */
let userResult: { data: { user: unknown }; error: unknown };
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => userResult } }),
}));
vi.mock("@/lib/env", () => ({ publicEnv: { supabaseUrl: "http://sb", supabaseAnonKey: "k" } }));

const { updateSession } = await import("../middleware");
const req = (path: string) => new NextRequest(new URL(path, "http://localhost"));
const location = (r: Response) => r.headers.get("location");

beforeEach(() => {
  userResult = { data: { user: null }, error: null };
});

describe("the session middleware does not sign people out when auth is unreachable", () => {
  for (const path of ["/academy/missions/six-names", "/account/children", "/admin"]) {
    it(`${path}: an unreachable auth service passes through, no redirect`, async () => {
      userResult = { data: { user: null }, error: { status: 0, message: "fetch failed" } };
      const r = await updateSession(req(path));
      expect(location(r)).toBeNull();
    });
  }

  it("a genuinely signed-out visitor is still sent to /login", async () => {
    userResult = { data: { user: null }, error: { status: 401, message: "Auth session missing" } };
    const r = await updateSession(req("/academy/my-missions"));
    expect(location(r)).toMatch(/\/login\?next=%2Facademy%2Fmy-missions$/);
  });

  it("no session and no error is signed out too", async () => {
    const r = await updateSession(req("/account"));
    expect(location(r)).toMatch(/\/login/);
  });
});

describe("the purchase journey survives sign-in", () => {
  it("an anonymous visitor to a purchase is sent to sign in, carrying where they were going", async () => {
    const r = await updateSession(req("/purchase/mars-bridge"));
    expect(location(r)).toMatch(/\/login\?next=%2Fpurchase%2Fmars-bridge$/);
  });

  it("an already signed-in parent on /login?next= goes on to it, not to My Missions", async () => {
    userResult = { data: { user: { id: "p" } }, error: null };
    const r = await updateSession(req("/login?next=%2Fpurchase%2Fmars-bridge"));
    expect(location(r)).toBe("http://localhost/purchase/mars-bridge");
  });

  it("…and the same applies on /signup", async () => {
    userResult = { data: { user: { id: "p" } }, error: null };
    const r = await updateSession(req("/signup?next=%2Fpurchase%2Fmars-bridge"));
    expect(location(r)).toBe("http://localhost/purchase/mars-bridge");
  });

  it("a hostile next= is not followed", async () => {
    userResult = { data: { user: { id: "p" } }, error: null };
    for (const next of ["//evil.example", "https://evil.example", "/\\evil.example"]) {
      const r = await updateSession(req(`/login?next=${encodeURIComponent(next)}`));
      expect(location(r)).toBe("http://localhost/academy/my-missions");
    }
  });
});
