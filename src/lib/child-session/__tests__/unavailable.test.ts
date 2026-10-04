import { describe, expect, it, vi } from "vitest";

/*
 * D-98 — a failed session lookup is not a signed-out child. Found in the
 * Six Names regression on a slow network: a blip in verify_child_session
 * made a child look signed out mid-mission and the next tap hit the error
 * boundary. Behavioural: the database client is mocked, not the source read.
 */

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "tok" }) }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/lib/env", () => ({ publicEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: "http://x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }), publicEnvValues: { NEXT_PUBLIC_SUPABASE_URL: "http://x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" } }));

const { getChildSession, ChildSessionUnavailableError } = await import("..");

describe("child session lookup", () => {
  it("a real session resolves to its child", async () => {
    rpc.mockResolvedValueOnce({ data: [{ child_id: "c1", display_name: "A", birth_year: 2015 }], error: null });
    expect((await getChildSession())?.childId).toBe("c1");
  });

  it("no such session is null (signed out)", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await getChildSession()).toBeNull();
  });

  it("an unreachable service is an error to retry, never 'signed out'", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
    await expect(getChildSession()).rejects.toBeInstanceOf(ChildSessionUnavailableError);
  });
});
