import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Viewing and replacing a code (D-143). The database half runs for real in
 * scripts/security-regression.sql; this is what the server does with its answers.
 */

const rpc = vi.fn();
const credential = { data: null as { id: string } | null, error: null as unknown };
const logged: unknown[] = [];
let owned = true;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({
  logInfo: (...a: unknown[]) => logged.push(a),
  logWarn: (...a: unknown[]) => logged.push(a),
}));
vi.mock("@/lib/permissions", () => {
  class AccessError extends Error {}
  const supabase = {
    rpc: (...a: unknown[]) => rpc("parent", ...a),
    from: () => ({
      select: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => credential }) }) }),
    }),
  };
  return {
    AccessError,
    requireParent: async () => ({ user: { id: "parent-1" }, supabase }),
    requireOwnedChild: async () => {
      if (!owned) throw new AccessError("not yours");
      return { supabase, child: { id: "child-1" } };
    },
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: (...a: unknown[]) => rpc("admin", ...a) }),
}));

process.env.CHILD_CODE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
const { sealCode } = await import("../code-crypto");
const { generateChildCodeAction, revealChildCodeAction } = await import("../parent-actions");
const { REPLACE_TO_VIEW } = await import("../copy");

const CODE = "ABCD-2345";
const form = (fields: Record<string, string> = {}) => {
  const f = new FormData();
  f.set("childId", "child-1");
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  rpc.mockReset();
  logged.length = 0;
  owned = true;
  credential.data = null;
  process.env.CHILD_CODE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

function issuing() {
  rpc.mockImplementation(async (who: string, fn: string) => {
    if (fn === "issue_child_access_code") return { data: [{ credential_id: "cred-1", code: CODE }], error: null };
    if (fn === "store_child_code_copy") return { data: true, error: null };
    throw new Error(`unexpected ${who} ${fn}`);
  });
}

describe("replacing a code", () => {
  it("refuses without the explicit confirmation, and generates nothing", async () => {
    credential.data = { id: "cred-0" };
    const result = await generateChildCodeAction({}, form());
    expect(result.error).toMatch(/confirm/i);
    expect(result.code).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("with the confirmation, returns the new code and stores a copy bound to its credential", async () => {
    credential.data = { id: "cred-0" };
    issuing();
    const result = await generateChildCodeAction({}, form({ confirmReplace: "yes" }));
    expect(result).toMatchObject({ code: CODE, viewable: true, replaced: true });
    const stored = rpc.mock.calls.find((c) => c[1] === "store_child_code_copy")!;
    expect(stored[0]).toBe("admin");
    expect(stored[2]).toMatchObject({ p_credential_id: "cred-1", p_child_id: "child-1", p_parent_id: "parent-1" });
    expect(stored[2].p_ciphertext).not.toContain(CODE);
  });

  it("a first code needs no confirmation", async () => {
    issuing();
    expect(await generateChildCodeAction({}, form())).toMatchObject({ code: CODE, replaced: false });
  });

  it("another family's child generates nothing", async () => {
    owned = false;
    const result = await generateChildCodeAction({}, form({ confirmReplace: "yes" }));
    expect(result.code).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("with no key the code still works and is shown, and the page knows it can't be viewed", async () => {
    delete process.env.CHILD_CODE_ENCRYPTION_KEY;
    issuing();
    const result = await generateChildCodeAction({}, form());
    expect(result).toMatchObject({ code: CODE, viewable: false });
    expect(rpc.mock.calls.some((c) => c[1] === "store_child_code_copy")).toBe(false);
  });
});

describe("showing a code", () => {
  const sealed = () => sealCode(CODE, { childId: "child-1", credentialId: "cred-1" });

  it("opens the copy for its parent, with the parent from the session", async () => {
    rpc.mockResolvedValue({ data: [{ credential_id: "cred-1", ciphertext: sealed() }], error: null });
    expect(await revealChildCodeAction({}, form())).toMatchObject({ code: CODE });
    expect(rpc).toHaveBeenCalledWith("admin", "read_child_code_copy", { p_child_id: "child-1", p_parent_id: "parent-1" });
  });

  it("another family's child reads nothing, and the database is never asked", async () => {
    owned = false;
    const result = await revealChildCodeAction({}, form());
    expect(result.code).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a code from before this feature says how to make it viewable", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await revealChildCodeAction({}, form())).toMatchObject({ error: REPLACE_TO_VIEW, notViewable: true });
  });

  it("a copy moved from another credential doesn't open", async () => {
    rpc.mockResolvedValue({ data: [{ credential_id: "cred-2", ciphertext: sealed() }], error: null });
    const result = await revealChildCodeAction({}, form());
    expect(result.code).toBeUndefined();
    expect(result.notViewable).toBe(true);
  });

  it("a missing key says the code still works", async () => {
    const copy = sealed();
    delete process.env.CHILD_CODE_ENCRYPTION_KEY;
    rpc.mockResolvedValue({ data: [{ credential_id: "cred-1", ciphertext: copy }], error: null });
    const result = await revealChildCodeAction({}, form());
    expect(result.code).toBeUndefined();
    expect(result.error).toMatch(/still works/);
  });

  it("the code is never logged", async () => {
    rpc.mockResolvedValue({ data: [{ credential_id: "cred-1", ciphertext: sealed() }], error: null });
    await revealChildCodeAction({}, form());
    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged)).not.toContain(CODE);
  });
});
