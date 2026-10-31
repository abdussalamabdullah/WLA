import { beforeEach, describe, expect, it, vi } from "vitest";

/* The server's half of cover uploads (D-146). Storage policies run for real in scripts/cover-regression.sql. */
const store = vi.hoisted(() => ({
  isAdmin: true,
  bytes: new Uint8Array(),
  type: "image/png",
  downloadError: null as unknown,
  removed: [] as string[][],
  listed: [] as { name: string; created_at: string }[],
  references: 0,
}));

vi.mock("@/lib/observability/logger", () => ({ logWarn: vi.fn(), logInfo: vi.fn(), logError: vi.fn(() => "ref") }));
vi.mock("@/lib/permissions", () => {
  class AccessError extends Error {}
  const supabase = {
    storage: {
      from: () => ({
        download: async () =>
          store.downloadError
            ? { data: null, error: store.downloadError }
            : { data: new Blob([store.bytes as BlobPart], { type: store.type }), error: null },
        remove: async (names: string[]) => {
          store.removed.push(names);
          return { error: null };
        },
        list: async () => ({ data: store.listed, error: null }),
      }),
    },
    from: () => ({ select: () => ({ eq: async () => ({ count: store.references, error: null }) }) }),
  };
  return {
    AccessError,
    requireAdmin: async () => {
      if (!store.isAdmin) throw new AccessError("no");
      return { supabase };
    },
  };
});

const { registerCoverUploadAction, discardCoverUploadAction } = await import("../cover-actions");

const ID = "11111111-2222-4333-8444-555555555555";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = new TextEncoder().encode("GIF89a......");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>');

beforeEach(() => {
  store.isAdmin = true;
  store.bytes = PNG;
  store.type = "image/png";
  store.downloadError = null;
  store.removed = [];
  store.listed = [];
  store.references = 0;
});

describe("checking an uploaded cover by its bytes", () => {
  it("accepts a real PNG in this mission's folder and returns the value to save", async () => {
    await expect(registerCoverUploadAction(ID, `${ID}/abc.png`)).resolves.toEqual({ value: `mission-covers/${ID}/abc.png` });
    expect(store.removed).toEqual([]);
  });

  it("accepts a real JPEG", async () => {
    store.bytes = JPEG;
    store.type = "image/jpeg";
    await expect(registerCoverUploadAction(ID, `${ID}/abc.jpg`)).resolves.toHaveProperty("value");
  });

  it.each([
    ["an SVG claiming to be a PNG", SVG, "image/png", "abc.png"],
    ["a GIF", GIF, "image/png", "abc.png"],
    ["a PNG named as a JPEG", PNG, "image/jpeg", "abc.jpg"],
    ["a PNG stored with the wrong type", PNG, "image/jpeg", "abc.png"],
    ["an empty file", new Uint8Array(), "image/png", "abc.png"],
  ])("refuses %s and deletes it", async (_label, bytes, type, name) => {
    store.bytes = bytes;
    store.type = type;
    const result = await registerCoverUploadAction(ID, `${ID}/${name}`);
    expect(result).toHaveProperty("error");
    expect(store.removed).toEqual([[`${ID}/${name}`]]);
  });

  it("refuses a file over 10 MB and deletes it", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PNG);
    store.bytes = big;
    await expect(registerCoverUploadAction(ID, `${ID}/abc.png`)).resolves.toEqual({ error: "Images must be 10 MB or smaller." });
    expect(store.removed).toHaveLength(1);
  });

  it.each([
    ["another mission's folder", "99999999-2222-4333-8444-555555555555/abc.png"],
    ["a climb out of the folder", `${ID}/../abc.png`],
    ["an SVG name", `${ID}/abc.svg`],
  ])("refuses %s without touching it", async (_label, path) => {
    await expect(registerCoverUploadAction(ID, path)).resolves.toHaveProperty("error");
    expect(store.removed).toEqual([]);
  });

  it("a non-admin is refused before anything happens", async () => {
    store.isAdmin = false;
    await expect(registerCoverUploadAction(ID, `${ID}/abc.png`)).resolves.toHaveProperty("error");
    expect(store.removed).toEqual([]);
  });
});

describe("removing covers nobody uses", () => {
  const value = `mission-covers/${ID}/abc.png`;

  it("an unsaved upload nobody references is deleted", async () => {
    await discardCoverUploadAction(ID, value);
    expect(store.removed).toEqual([[`${ID}/abc.png`]]);
  });

  it("a file another mission references is kept", async () => {
    store.references = 1;
    await discardCoverUploadAction(ID, value);
    expect(store.removed).toEqual([]);
  });

  it("a local path or another mission's file is never deleted", async () => {
    await discardCoverUploadAction(ID, "/missions/six-names.jpg");
    await discardCoverUploadAction(ID, "mission-covers/99999999-2222-4333-8444-555555555555/abc.png");
    expect(store.removed).toEqual([]);
  });

  it("the sweep removes an old, unreferenced upload and leaves a recent one", async () => {
    store.listed = [
      { name: "old.png", created_at: new Date(Date.now() - 2 * 3600_000).toISOString() },
      { name: "recent.png", created_at: new Date().toISOString() },
    ];
    await registerCoverUploadAction(ID, `${ID}/abc.png`);
    expect(store.removed).toEqual([[`${ID}/old.png`]]);
  });

  it("the sweep leaves an old file that's still referenced", async () => {
    store.references = 1;
    store.listed = [{ name: "old.png", created_at: new Date(Date.now() - 2 * 3600_000).toISOString() }];
    await registerCoverUploadAction(ID, `${ID}/abc.png`);
    expect(store.removed).toEqual([]);
  });
});
