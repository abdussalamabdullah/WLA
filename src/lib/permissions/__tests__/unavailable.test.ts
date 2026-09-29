import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Found in staging browser QA under heavy packet loss: switching to a parent's
 * OWN child raised "That child profile does not belong to this account",
 * because a failed query was read as an empty one. Behavioural: the checks run
 * against a stubbed client and we assert which error comes out.
 */
let userResult: { data: { user: unknown }; error: unknown };
let rowResult: { data: unknown; error: unknown };

const builder = () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) q[m] = () => q;
  q.maybeSingle = async () => rowResult;
  return q;
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => userResult },
    from: () => builder(),
  }),
}));

const { requireOwnedChild, requireParent, AccessError, ServiceUnavailableError } =
  await import("../index");

const signedIn = { data: { user: { id: "parent-1" } }, error: null };

beforeEach(() => {
  userResult = signedIn;
  rowResult = { data: null, error: null };
});

describe("a failed read is not a denial", () => {
  it("an empty result is still 'not your child' (the boundary holds)", async () => {
    await expect(requireOwnedChild("c")).rejects.toBeInstanceOf(AccessError);
  });

  it("a failed query raises ServiceUnavailableError, never AccessError", async () => {
    rowResult = { data: null, error: { message: "fetch failed" } };
    const e = await requireOwnedChild("c").catch((x) => x);
    expect(e).toBeInstanceOf(ServiceUnavailableError);
    expect(e).not.toBeInstanceOf(AccessError);
  });

  it("an unreachable auth service does not sign the parent out", async () => {
    userResult = { data: { user: null }, error: { status: 0, message: "fetch failed" } };
    await expect(requireParent()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it("an invalid session is still 'unauthenticated'", async () => {
    userResult = { data: { user: null }, error: { status: 401, message: "invalid JWT" } };
    const e = await requireParent().catch((x) => x);
    expect(e).toBeInstanceOf(AccessError);
    expect(e.reason).toBe("unauthenticated");
  });

  it("a real row is returned unchanged", async () => {
    rowResult = { data: { id: "c", parent_id: "parent-1" }, error: null };
    await expect(requireOwnedChild("c")).resolves.toMatchObject({ child: { id: "c" } });
  });
});
