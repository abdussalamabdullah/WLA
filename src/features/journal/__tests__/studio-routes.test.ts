// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * The new server boundaries, executed with fakes:
 *   - the Medium import route (D-129, D-137)
 *   - the private-preview image route (D-134)
 *   - registering an image the browser stored (D-135)
 * What the database itself allows is executed in journal-regression.sql
 * (sections P, U, T).
 */
const h = vi.hoisted(() => ({
  requireJournalEditor: vi.fn(),
  requireJournalStaff: vi.fn(),
  importUploads: vi.fn(),
  previewPath: vi.fn(),
  signed: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "app.test" }) }));
vi.mock("@/lib/observability/logger", () => ({ logWarn: vi.fn(), logAccessDenied: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/permissions/journal", () => ({ requireJournalEditor: h.requireJournalEditor, requireJournalStaff: h.requireJournalStaff }));
vi.mock("@/features/journal/import-run", () => ({ importUploads: h.importUploads }));
vi.mock("@/features/journal/preview", async () => {
  const actual = await vi.importActual<typeof import("../preview")>("../preview");
  return { ...actual, getPreviewMediaPath: h.previewPath };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: h.createAdminClient }));
vi.mock("@/features/journal/media-cleanup", () => ({ removeUnusedMedia: vi.fn(async () => 0) }));

import { AccessError } from "@/lib/permissions";
import { POST as importPOST } from "@/app/editorial/import/upload/route";
import { GET as previewMediaGET } from "@/app/(functional)/journal-preview/[token]/media/[id]/route";
import { registerUploadAction } from "../actions";

const TOKEN = "A".repeat(43);
const MEDIA = "0b8f3c2e-1d4a-4c8e-9f00-123456789abc";
const ARTICLE = "11111111-2222-4333-8444-555555555555";

beforeEach(() => Object.values(h).forEach((f) => f.mockReset()));

async function importRequest(over: { origin?: string | null; length?: number } = {}) {
  const fd = new FormData();
  fd.append("files", new File(["<html></html>"], "2019_a.html", { type: "text/html" }));
  // Serialise once, so the body and its multipart boundary agree.
  const draft = new Request("https://app.test/editorial/import/upload", { method: "POST", body: fd });
  const body = await draft.arrayBuffer();
  const headers = new Headers({ "content-type": draft.headers.get("content-type")!, host: "app.test", "content-length": String(over.length ?? body.byteLength) });
  if (over.origin !== null) headers.set("origin", over.origin ?? "https://app.test");
  return new NextRequest("https://app.test/editorial/import/upload", { method: "POST", body, headers });
}

describe("POST /editorial/import/upload", () => {
  it("refuses a cross-site request before anything else", async () => {
    const res = await importPOST(await importRequest({ origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(h.requireJournalEditor).not.toHaveBeenCalled();
    expect((await importPOST(await importRequest({ origin: null }))).status).toBe(403);
  });

  it("only an editor can import", async () => {
    h.requireJournalEditor.mockRejectedValue(new AccessError("no", "not_journal_staff"));
    const res = await importPOST(await importRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only an editor can import." });
    expect(h.importUploads).not.toHaveBeenCalled();
  });

  it("refuses a body the proxy would truncate", async () => {
    h.requireJournalEditor.mockResolvedValue({ supabase: {} });
    const res = await importPOST(await importRequest({ length: 11 * 1024 * 1024 }));
    expect(res.status).toBe(413);
    expect(h.importUploads).not.toHaveBeenCalled();
  });

  it("imports with the editor's own session and answers with the run", async () => {
    const supabase = { tag: "editor-session" };
    h.requireJournalEditor.mockResolvedValue({ supabase });
    h.importUploads.mockResolvedValue({ runId: "run-1" });
    const res = await importPOST(await importRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runId: "run-1" });
    expect(h.importUploads.mock.calls[0][0]).toBe(supabase);
    expect(h.importUploads.mock.calls[0][2]).toEqual({ includeDrafts: false });
  });
});

describe("GET /journal-preview/:token/media/:id", () => {
  const call = () => previewMediaGET(new NextRequest(`https://app.test/journal-preview/${TOKEN}/media/${MEDIA}`), { params: Promise.resolve({ token: TOKEN, id: MEDIA }) });

  it("an image the database does not allow is a plain 404, and nothing is signed", async () => {
    h.previewPath.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(h.createAdminClient).not.toHaveBeenCalled();
  });

  it("an allowed image: exactly the database's path is signed for five minutes, never cached, no referrer", async () => {
    h.previewPath.mockResolvedValue(`${ARTICLE}/photo.png`);
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "http://db.test/signed" }, error: null }));
    h.createAdminClient.mockReturnValue({ storage: { from: (b: string) => (b === "journal-media" ? { createSignedUrl } : null) } });
    const res = await call();
    expect(h.previewPath).toHaveBeenCalledWith(TOKEN, MEDIA);
    expect(createSignedUrl).toHaveBeenCalledWith(`${ARTICLE}/photo.png`, 300);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://db.test/signed");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });
});

describe("registerUploadAction", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  function staffWith(bytes: Uint8Array, registerError: { message: string } | null = null) {
    const remove = vi.fn(async () => ({ error: null }));
    const rpc = vi.fn(async () => (registerError ? { data: null, error: registerError } : { data: MEDIA, error: null }));
    const download = vi.fn(async () => ({ data: new Blob([bytes as BlobPart]), error: null }));
    h.requireJournalStaff.mockResolvedValue({ supabase: { rpc, storage: { from: () => ({ download, remove }) } }, caps: {} });
    return { rpc, remove, download };
  }
  const fd = (path: string) => {
    const f = new FormData();
    f.set("articleId", ARTICLE);
    f.set("path", path);
    return f;
  };

  it("a path outside the article's folder is refused before anything is read", async () => {
    const s = staffWith(PNG);
    const r = await registerUploadAction({}, fd(`ffffffff-2222-4333-8444-555555555555/x.png`));
    expect(r.error).toMatch(/isn't in this article's folder/);
    expect(s.download).not.toHaveBeenCalled();
  });

  it("a file whose real bytes are not an allowed image is removed again and never registered", async () => {
    const s = staffWith(new TextEncoder().encode("<svg><script>x</script></svg>"));
    const r = await registerUploadAction({}, fd(`${ARTICLE}/evil.png`));
    expect(r.error).toBe("Use a PNG, JPEG, WebP or GIF image.");
    expect(s.remove).toHaveBeenCalledWith([`${ARTICLE}/evil.png`]);
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("a name that disagrees with the content is refused", async () => {
    const s = staffWith(PNG);
    const r = await registerUploadAction({}, fd(`${ARTICLE}/photo.jpg`));
    expect(r.error).toBeTruthy();
    expect(s.rpc).not.toHaveBeenCalled();
  });

  it("a real image is registered with its sniffed type and true size", async () => {
    const s = staffWith(PNG);
    const r = await registerUploadAction({}, fd(`${ARTICLE}/photo.png`));
    expect(r).toMatchObject({ ok: true, mediaId: MEDIA, mediaUrl: `/api/journal/media/${MEDIA}` });
    expect(s.rpc).toHaveBeenCalledWith("journal_register_media", expect.objectContaining({ p_mime: "image/png", p_bytes: PNG.byteLength, p_path: `${ARTICLE}/photo.png` }));
  });

  it("if the database refuses, the file is removed again", async () => {
    const s = staffWith(PNG, { message: "not_allowed" });
    const r = await registerUploadAction({}, fd(`${ARTICLE}/photo.png`));
    expect(r.error).toBeTruthy();
    expect(s.remove).toHaveBeenCalledWith([`${ARTICLE}/photo.png`]);
  });
});
