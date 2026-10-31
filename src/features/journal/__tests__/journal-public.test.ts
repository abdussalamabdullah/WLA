// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Source guards for the Journal's boundaries (D-127, D-131, D-132). They
 * prove PRESENCE in source, not behaviour — the behaviour is executed in
 * scripts/journal-regression.sql and public-api.test.ts — so they run on
 * comment-free code, and each was checked to fail when what it guards breaks.
 */
const ROOT = join(__dirname, "../../../..");
const code = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const filesUnder = (rel: string): string[] =>
  readdirSync(join(ROOT, rel)).flatMap((n) => {
    const p = `${rel}/${n}`;
    return statSync(join(ROOT, p)).isDirectory() ? filesUnder(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

const API = filesUnder("src/app/api/journal");
const PUBLIC = [...API, "src/features/journal/public-api.ts", "src/features/journal/http.ts"];
const ALL = [...PUBLIC, ...filesUnder("src/features/journal"), ...filesUnder("src/app/editorial"), ...filesUnder("src/components/journal")].filter(
  (f) => !f.includes("__tests__"),
);

describe("the public API (what Lovable reads) exposes only live content", () => {
  it("no public file selects from a journal table other than categories", () => {
    expect(PUBLIC.filter((f) => /\.from\(\s*["']journal_(?!categories)/.test(code(f)))).toEqual([]);
  });

  it("public-api.ts calls only the public functions", () => {
    const rpcs = [...code("src/features/journal/public-api.ts").matchAll(/rpc\(\s*["'](\w+)/g)].map((m) => m[1]);
    expect([...new Set(rpcs)].sort()).toEqual(["journal_public_article", "journal_public_list", "journal_public_tags"]);
  });

  it("it uses an anonymous, cookie-less client — never the visitor's session or the service role", () => {
    const api = code("src/features/journal/public-api.ts");
    expect(api).toMatch(/from "@supabase\/supabase-js"/);
    expect(api).toMatch(/persistSession: false/);
    expect(api).not.toMatch(/next\/headers|cookies\(|lib\/supabase\/server|supabase\/admin/);
  });

  it("the article routes go through public-api.ts only", () => {
    for (const f of API.filter((x) => !x.includes("/media/"))) {
      expect(code(f)).toMatch(/@\/features\/journal\/public-api/);
      expect(code(f)).not.toMatch(/lib\/supabase/);
    }
  });

  it("CORS never allows credentials", () => {
    const http = code("src/features/journal/http.ts");
    expect(http).toMatch(/"Access-Control-Allow-Origin": "\*"/);
    expect(http).not.toMatch(/Allow-Credentials/);
  });

  it("article bodies are sanitised on the way out, as well as on save", () => {
    expect(code("src/features/journal/public-api.ts")).toMatch(/return sanitizeArticleHtml\(html\)/);
    // Sanitised first; a preview only rewrites image URLs the allowlist kept, afterwards.
    const view = code("src/components/journal/article-view.tsx");
    expect(view).toMatch(/const clean = sanitizeArticleHtml\(article\.bodyHtml\);\s*const body = mediaSrc\s*\?\s*clean\.replace\(/);
    expect(view).toMatch(/:\s*clean;/);
  });

  it("the media route signs with the visitor's own session", () => {
    const route = code("src/app/api/journal/media/[id]/route.ts");
    expect(route).toMatch(/from "@\/lib\/supabase\/server"/);
    expect(route).toMatch(/rpc\("journal_media_path"/);
  });

  it("there is no public Journal page in this app (D-131: Lovable owns /journal)", () => {
    expect(filesUnder("src/app/(public)/journal")).toEqual(["src/app/(public)/journal/page.tsx"]);
  });
});

describe("secrets and publication triggers", () => {
  it("nothing in the Journal uses the service role or a secret", () => {
    expect(ALL.filter((f) => /supabase\/admin|createAdminClient|SERVICE_ROLE|CRON_SECRET/.test(code(f)))).toEqual([]);
  });

  it("no application code can trigger scheduled publication (only the database job, D-132)", () => {
    expect(ALL.filter((f) => /journal_publish_due/.test(code(f)))).toEqual([]);
  });
});

describe("every studio action checks the caller first", () => {
  const src = code("src/features/journal/actions.ts");
  const bodies = [...src.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)];
  it("found the actions", () => expect(bodies.length).toBeGreaterThan(15));
  it.each(bodies.map((m) => [m[1], m[2]]))("%s", (_name, body) => {
    expect(body).toMatch(/await staff\(\)|requireJournalEditor\(\)|return step\(/);
  });
  it("step() itself checks", () => {
    expect(src).toMatch(/async function step\([\s\S]*?const s = await staff\(\);\s*if \(!s\) return NOT_STAFF;/);
  });
  it("saving sanitises the body before it reaches the database", () => {
    expect(src).toMatch(/body_html: sanitizeArticleHtml\(d\.body_html\)/);
  });
});

describe("the studio is behind a signed-in session and its own gate", () => {
  it("middleware treats /editorial as signed-in only", () => {
    expect(code("src/lib/supabase/middleware.ts")).toMatch(/PARENT_ONLY_PREFIXES = \[[^\]]*"\/editorial"/);
  });
  it("the studio layout calls requireJournalStaff", () => {
    expect(code("src/app/editorial/layout.tsx")).toMatch(/await requireJournalStaff\(\)/);
  });
});

/*
 * PRIVATE PREVIEW LINKS (D-134). The token is the only key; reads are
 * anonymous and cookie-less; the one use of the server credential signs a
 * path the database has already authorised (the D-64 shape) and nothing else.
 */
describe("private preview links", () => {
  const PREVIEW = filesUnder("src/app/(functional)/journal-preview");
  const route = "src/app/(functional)/journal-preview/[token]/media/[id]/route.ts";

  it("previews read through an anonymous, cookie-less client and only the two preview functions", () => {
    const src = code("src/features/journal/preview.ts");
    expect(src).toMatch(/persistSession: false/);
    expect(src).not.toMatch(/next\/headers|cookies\(|lib\/supabase\/server|supabase\/admin/);
    const rpcs = [...src.matchAll(/rpc\(\s*["'](\w+)/g)].map((m) => m[1]).sort();
    expect([...new Set(rpcs)]).toEqual(["journal_preview_article", "journal_preview_media_path"]);
  });

  it("only the preview image route uses the server credential, and only after the database said yes", () => {
    const users = [...PREVIEW, ...ALL].filter((f) => /supabase\/admin|createAdminClient/.test(code(f)));
    expect(users).toEqual([route]);
    const src = code(route);
    expect(src.indexOf("getPreviewMediaPath(")).toBeGreaterThan(-1);
    expect(src.indexOf("getPreviewMediaPath(")).toBeLessThan(src.indexOf("createAdminClient()"));
    expect(src).toMatch(/if \(!path\) return new NextResponse\(null, \{ status: 404/);
    expect(src).toMatch(/createSignedUrl\(path, 300\)/);
    // It never takes a path, a bucket or an article from the request.
    expect(src).not.toMatch(/searchParams|request\.(json|formData|text)\(/);
  });

  it("a preview is never indexed, cached or leaked as a referrer", () => {
    const page = code("src/app/(functional)/journal-preview/[token]/page.tsx");
    expect(page).toMatch(/robots: \{ index: false, follow: false, nocache: true \}/);
    expect(page).toMatch(/referrer: "no-referrer"/);
    expect(code(route)).toMatch(/"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer"/);
  });

  it("the public API knows nothing of previews", () => {
    expect(PUBLIC.filter((f) => /preview/i.test(code(f)))).toEqual([]);
  });
});

describe("uploads go to private storage with the author's own session (D-135)", () => {
  it("the browser upload targets the private journal-media bucket and never upserts", () => {
    const src = code("src/features/journal/upload-client.ts");
    expect(src).toMatch(/\/storage\/v1\/object\/\$\{opts\.bucket \?\? "journal-media"\}\//);
    expect(src).toMatch(/"x-upsert", "false"/);
    expect(src).not.toMatch(/SERVICE_ROLE|supabase\/admin|service_role/);
  });

  it("the server reads the stored bytes back and checks them before registering", () => {
    const src = code("src/features/journal/actions.ts");
    const body = src.slice(src.indexOf("export async function registerUploadAction"), src.indexOf("// -------------------------------------------------------- preview links"));
    expect(body).toMatch(/isArticleMediaPath\(articleId, path\)/);
    expect(body).toMatch(/\.download\(path\)/);
    expect(body.indexOf("imageProblem(bytes)")).toBeLessThan(body.indexOf('rpc("journal_register_media"'));
    expect(body).toMatch(/await bucket\.remove\(\[path\]\)/);
  });
});
