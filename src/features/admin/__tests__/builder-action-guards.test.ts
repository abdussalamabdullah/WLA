import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The two protective checks added to the builder's server actions, executed
 * against a fake Supabase client (no database is touched):
 *
 *   D-117  a NEW screen may not take an existing key — `admin_upsert_screen`
 *          saves by key, so it would silently replace that screen;
 *   D-119  a new draft is refused while one already exists.
 *
 * Both only ADD refusals in front of the existing RPCs; neither RPC changed.
 */

const rpc = vi.fn();
const maybeSingle = vi.fn();
const chain = { select: () => chain, eq: () => chain, in: () => chain, limit: () => chain, maybeSingle };
const supabase = { rpc, from: vi.fn(() => chain) };

vi.mock("@/lib/permissions", () => ({ requireAdmin: vi.fn(async () => ({ supabase })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`); }) }));
vi.mock("@/lib/observability/logger", () => ({ logWarn: vi.fn(), logError: vi.fn() }));

import { createVersionAction, saveScreenAction } from "@/features/admin/builder-actions";

function screenForm(fields: Record<string, string>) {
  const f = new FormData();
  const base = { missionId: "m1", slug: "demo", version: "3", type: "content", title: "Hello", body: "", sequence: "10", configuration: JSON.stringify({ next: "end" }) };
  for (const [k, v] of Object.entries({ ...base, ...fields })) f.set(k, v);
  return f;
}

beforeEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
  rpc.mockImplementation(async (fn: string) =>
    fn === "admin_draft_screens" ? { data: [{ screen_key: "intro" }, { screen_key: "end" }], error: null } : { data: null, error: null },
  );
});

describe("a new screen never replaces an existing one (D-117)", () => {
  it("refuses a new screen whose key is taken, without saving anything", async () => {
    const result = await saveScreenAction({}, screenForm({ screen_key: "intro", isNew: "1" }));
    expect(result.fieldErrors?.screen_key).toMatch(/already uses this key/);
    expect(rpc).not.toHaveBeenCalledWith("admin_upsert_screen", expect.anything());
  });

  it("saves a new screen with a free key", async () => {
    const result = await saveScreenAction({}, screenForm({ screen_key: "fresh", isNew: "1" }));
    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("admin_upsert_screen", expect.objectContaining({ p_screen_key: "fresh" }));
  });

  it("editing an existing screen still saves it by its key", async () => {
    const result = await saveScreenAction({}, screenForm({ screen_key: "intro" }));
    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("admin_upsert_screen", expect.objectContaining({ p_screen_key: "intro" }));
    expect(rpc).not.toHaveBeenCalledWith("admin_draft_screens", expect.anything());
  });

  it("an invalid configuration is explained in builder words and not saved", async () => {
    const result = await saveScreenAction({}, screenForm({ screen_key: "pick", type: "choice", configuration: JSON.stringify({ prompt: "Which?", options: [] }) }));
    expect(result.fieldErrors?.configuration).toMatch(/^Options: add at least \d+\.$/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("one draft at a time (D-119)", () => {
  const form = () => { const f = new FormData(); f.set("missionId", "m1"); f.set("slug", "demo"); f.set("fromVersion", "2"); return f; };

  it("refuses while a draft exists, and creates nothing", async () => {
    maybeSingle.mockResolvedValue({ data: { version: 3 }, error: null });
    const result = await createVersionAction({}, form());
    expect(result.error).toMatch(/Version 3 is already a draft/);
    expect(rpc).not.toHaveBeenCalledWith("create_mission_version", expect.anything());
  });

  it("creates from the requested version and goes to the new draft", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    rpc.mockImplementation(async (fn: string) => (fn === "create_mission_version" ? { data: { version: 4 }, error: null } : { data: null, error: null }));
    await expect(createVersionAction({}, form())).rejects.toThrow("REDIRECT /admin/builder/demo/4");
    expect(rpc).toHaveBeenCalledWith("create_mission_version", { p_mission_id: "m1", p_from_version: 2 });
  });
});
