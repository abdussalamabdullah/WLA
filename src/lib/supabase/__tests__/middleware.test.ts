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
