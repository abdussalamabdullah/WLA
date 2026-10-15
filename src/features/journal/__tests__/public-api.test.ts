// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * The public Journal API, executed against a fake Supabase client. Proves the
 * SHAPE of what Lovable receives: only allowlisted live fields, absolute image
 * URLs, sanitised HTML, validated parameters, stable error codes, open CORS
 * without credentials. That the database only ever returns live rows is
 * proved separately (journal-regression.sql, sections B, F, H).
 */
const rpc = vi.fn();
const order2 = vi.fn();
const fromChain = { select: () => fromChain, order: (col: string) => (col === "name" ? order2() : fromChain) };
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ rpc, from: () => fromChain })) }));
vi.mock("@/lib/env", () => ({ publicEnv: { supabaseUrl: "http://db.test", supabaseAnonKey: "anon" } }));
vi.mock("@/lib/observability/logger", () => ({ logWarn: vi.fn(), logError: vi.fn(() => "WLA-TEST") }));

import { GET as listGET, OPTIONS } from "@/app/api/journal/articles/route";
import { GET as articleGET } from "@/app/api/journal/articles/[slug]/route";
import { GET as categoriesGET } from "@/app/api/journal/categories/route";
import { GET as tagsGET } from "@/app/api/journal/tags/route";

const MEDIA = "0b8f3c2e-1d4a-4c8e-9f00-123456789abc";
const listRow = {
  slug: "less-authority", title: "Less Authority", excerpt: "Attention.", author_name: "WLA",
  category_slug: "essays", category_name: "Essays", tags: ["reading-notes"], featured_media_id: MEDIA,
  featured_alt: "A desk", display_date: "2019-04-02T10:15:23Z", updated_at: "2026-10-14T09:00:00Z", word_count: 920,
};
const articleRow = {
  ...listRow, body_html: `<p onclick="x()">Hi</p><script>bad()</script><figure><img src="/api/journal/media/${MEDIA}" alt="Desk"></figure>`,
  seo_title: null, seo_description: null, canonical_url: null, source_url: "https://medium.com/@wla/less-authority-1a2b3c4d5e6f",
  first_published_at: "2026-10-01T09:00:00Z", redirect_to: null,
  // Columns that must NEVER be passed through, even if a function returned them.
  revision_id: "secret-revision", content_hash: "secret-hash", comments: "secret comment",
};
const req = (url: string) => new NextRequest(new URL(url, "https://app.wla.test"));
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  rpc.mockReset();
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("GET /api/journal/articles", () => {
  it("returns live summaries with absolute image URLs and pagination", async () => {
    rpc.mockResolvedValue({ data: [listRow, { ...listRow, slug: "two" }, { ...listRow, slug: "three" }], error: null });
    const res = await listGET(req("/api/journal/articles?page=2&pageSize=2&category=essays"));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("journal_public_list", { p_category: "essays", p_tag: null, p_query: null, p_limit: 3, p_offset: 2 });
    const body = await res.json();
    expect(body.pagination).toEqual({ page: 2, pageSize: 2, hasMore: true });
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      slug: "less-authority", title: "Less Authority", excerpt: "Attention.", author: { name: "WLA" },
      category: { slug: "essays", name: "Essays" }, tags: [{ slug: "reading-notes", label: "reading notes" }],
      featuredImage: { url: `https://app.wla.test/api/journal/media/${MEDIA}`, alt: "A desk" },
      publishedAt: "2019-04-02T10:15:23Z", updatedAt: "2026-10-14T09:00:00Z", readingMinutes: 4,
    });
  });

  it("uses NEXT_PUBLIC_SITE_URL for absolute URLs when set", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://academy.withinlab.test/";
    rpc.mockResolvedValue({ data: [listRow], error: null });
    const body = await (await listGET(req("/api/journal/articles"))).json();
    expect(body.data[0].featuredImage.url).toBe(`https://academy.withinlab.test/api/journal/media/${MEDIA}`);
  });

  it.each([
    ["page=0"], ["page=abc"], ["pageSize=51"], ["pageSize=0"], ["category=Bad%20Slug"], ["tag=%3Cscript%3E"], [`q=${"x".repeat(201)}`],
  ])("rejects %s with 400 invalid_parameter and never queries", async (qs) => {
    const res = await listGET(req(`/api/journal/articles?${qs}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_parameter");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a database failure is 503 unavailable, with no database text", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'relation "journal_revisions" permission denied' } });
    const res = await listGET(req("/api/journal/articles"));
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe("unavailable");
    expect(text).not.toMatch(/journal_revisions|permission/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("an unexpected failure (a thrown error, not a database answer) is the same 503, with no detail", async () => {
    rpc.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2"));
    const res = await listGET(req("/api/journal/articles"));
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: { code: "unavailable", message: "The Journal is temporarily unavailable." } });
    expect(text).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|hunter2/);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("CORS is open for reading and never allows credentials; responses cache briefly", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await listGET(req("/api/journal/articles"));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    expect(res.headers.get("cache-control")).toMatch(/s-maxage=30/);
    const pre = OPTIONS();
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });
});

describe("GET /api/journal/articles/:slug", () => {
  it("returns only allowlisted fields, sanitised HTML and absolute images", async () => {
    rpc.mockResolvedValue({ data: [articleRow], error: null });
    const res = await articleGET(req("/api/journal/articles/less-authority"), params("less-authority"));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/secret|onclick|<script|bad\(\)/);
    const { data } = JSON.parse(text);
    expect(Object.keys(data).sort()).toEqual([
      "author", "bodyHtml", "category", "excerpt", "featuredImage", "firstPublishedAt", "originalSource",
      "publishedAt", "readingMinutes", "seo", "slug", "tags", "title", "updatedAt",
    ]);
    expect(data.bodyHtml).toBe(`<p>Hi</p><figure><img src="https://app.wla.test/api/journal/media/${MEDIA}" alt="Desk" /></figure>`);
    expect(data.seo).toEqual({ title: "Less Authority", description: "Attention.", canonicalUrl: null });
    expect(data.originalSource).toEqual({ url: articleRow.source_url, site: "medium" });
  });

  it("a renamed article answers movedTo", async () => {
    rpc.mockResolvedValue({ data: [{ ...articleRow, slug: null, title: null, redirect_to: "new-slug" }], error: null });
    const res = await articleGET(req("/api/journal/articles/old-slug"), params("old-slug"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ movedTo: "new-slug" });
  });

  it("an unknown, draft or unpublished slug is the same 404", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await articleGET(req("/api/journal/articles/a-draft"), params("a-draft"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "No published article has that address." } });
  });

  it("a thrown error on the article route is 503 unavailable", async () => {
    rpc.mockRejectedValue(new Error("boom"));
    const res = await articleGET(req("/api/journal/articles/less-authority"), params("less-authority"));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("unavailable");
  });

  it("a malformed slug is 404 without a query", async () => {
    const res = await articleGET(req("/api/journal/articles/x"), params("../etc/passwd"));
    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("GET /api/journal/categories", () => {
  it("returns slug, name and description only", async () => {
    order2.mockResolvedValue({ data: [{ slug: "essays", name: "Essays", description: "Longer writing.", sort_order: 1, id: "secret-id" }], error: null });
    const body = await (await categoriesGET()).json();
    expect(body).toEqual({ data: [{ slug: "essays", name: "Essays", description: "Longer writing." }] });
  });
});

describe("GET /api/journal/tags", () => {
  it("returns slug and label only", async () => {
    rpc.mockResolvedValue({ data: [{ tag: "reading-notes" }], error: null });
    const res = await tagsGET();
    expect(rpc).toHaveBeenCalledWith("journal_public_tags", {});
    expect(await res.json()).toEqual({ data: [{ slug: "reading-notes", label: "reading notes" }] });
  });

  it("a database failure is 503 unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied for function journal_public_tags" } });
    const res = await tagsGET();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(/permission|journal_public_tags/);
  });
});
