// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runMediumImport, type ImportDeps } from "../importer";
import { fetchMediumImage, imageProblem, isMediumImageUrl, mediaPath, sniffImage } from "../media";
import type { ExportFile } from "../medium";

/*
 * The import run against an in-memory stand-in for the database that keeps
 * the same contract as journal_import_prepare / _apply / journal_register_media
 * (whose real behaviour — idempotency, untouched-only updates, slug
 * de-duplication — is executed in scripts/journal-regression.sql, section J).
 * Network and storage are fakes; nothing leaves the process.
 */

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
const POST: ExportFile = { name: "posts/2019-04-02_Less-Authority-1a2b3c4d5e6f.html", html: fixture("2019-04-02_Less-Authority-1a2b3c4d5e6f.html") };
const DRAFT: ExportFile = { name: "posts/draft_Unfinished-thought-0f0e0d0c0b0a.html", html: fixture("draft_Unfinished-thought-0f0e0d0c0b0a.html") };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

type Source = { article: string; hash: string | null; edited: boolean };

function fakeDb() {
  const sources = new Map<string, Source>();
  const articles = new Map<string, { fields: Record<string, unknown> }>();
  const media = new Map<string, string>(); // path → id
  const objects = new Set<string>();
  const slugs = new Set<string>();
  const log: { fn: string; args: Record<string, unknown> }[] = [];
  let n = 0;
  const failNext = new Set<string>();

  const rpc: ImportDeps["rpc"] = async <T,>(fn: string, args: Record<string, unknown>) => {
    log.push({ fn, args });
    const ok = (data: unknown) => ({ data: data as T, error: null });
    if (failNext.has(fn)) {
      failNext.delete(fn);
      return { data: null, error: { message: "network" } };
    }
    switch (fn) {
      case "journal_import_start":
        return ok("run-1");
      case "journal_import_log":
      case "journal_import_finish":
        return ok(null);
      case "journal_import_prepare": {
        const key = String(args.p_source_id);
        const s = sources.get(key);
        if (s) {
          if (s.hash && s.hash === args.p_source_hash) return ok([{ outcome: "unchanged", article_id: s.article }]);
          if (s.edited) return ok([{ outcome: "edited", article_id: s.article }]);
          return ok([{ outcome: s.hash ? "update" : "new", article_id: s.article }]);
        }
        const article = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
        articles.set(article, { fields: {} });
        sources.set(key, { article, hash: null, edited: false });
        return ok([{ outcome: "new", article_id: article }]);
      }
      case "journal_import_apply": {
        const s = sources.get(String(args.p_source_id))!;
        const fields = args.p_fields as Record<string, string>;
        const own = articles.get(s.article)!.fields.slug as string | undefined;
        if (own) slugs.delete(own);
        let slug = fields.slug;
        for (let i = 2; slugs.has(slug); i++) slug = `${fields.slug}-${i}`;
        slugs.add(slug);
        articles.get(s.article)!.fields = { ...fields, slug };
        s.hash = String(args.p_source_hash);
        return ok([{ final_slug: slug, slug_changed: slug !== fields.slug }]);
      }
      case "journal_register_media": {
        const path = String(args.p_path);
        if (!objects.has(path)) return { data: null, error: { message: "object_missing" } };
        const id = `11111111-1111-4111-8111-${String(media.size + 1).padStart(12, "0")}`;
        media.set(path, id);
        return ok(id);
      }
    }
    throw new Error(`unexpected rpc ${fn}`);
  };

  const deps: ImportDeps = {
    rpc,
    upload: async (path) => {
      if (objects.has(path)) return "exists";
      objects.add(path);
      return "ok";
    },
    findMedia: async (path) => media.get(path) ?? null,
    fetchImage: vi.fn(async (url: string) =>
      url.includes("cdn-images-1.medium.com") ? { bytes: JPEG, type: { mime: "image/jpeg" as const, ext: "jpg" } } : { error: "it isn't hosted on Medium's image servers" },
    ),
  };
  return { deps, sources, articles, media, objects, slugs, log, failNext };
}

const opts = { includeDrafts: false, sourceName: "medium-export.zip" };

let db: ReturnType<typeof fakeDb>;
beforeEach(() => {
  db = fakeDb();
});

describe("a first import", () => {
  it("creates one draft per post, with images in WLA media and a report", async () => {
    const r = await runMediumImport([POST], [], db.deps, opts);
    expect(r.totals.created).toBe(1);
    const item = r.items[0];
    expect(item).toMatchObject({ outcome: "created", sourceId: "1a2b3c4d5e6f", finalSlug: "less-authority" });
    const fields = db.articles.get(item.articleId!)!.fields;
    // The lead image is the featured image, not repeated in the body.
    expect(fields.featured_media_id).toBe([...db.media.values()][0]);
    expect(String(fields.body_html)).not.toContain("<img");
    expect(fields.original_published_at).toBe("2019-04-02T10:15:23.123Z");
    expect(fields.author_name).toBe("Within Lab Academy");
    // The non-Medium image was not fetched into WLA, and the report says so.
    expect(item.messages.map((m) => m.text).join("\n")).toMatch(/Image 2 wasn't imported: it isn't hosted on Medium's image servers/);
  });

  it("never publishes: the run calls no publishing function", async () => {
    await runMediumImport([POST], [], db.deps, opts);
    expect(db.log.map((l) => l.fn).filter((f) => /publish|schedule|decide|submit/.test(f))).toEqual([]);
  });

  it("skips Medium drafts unless asked, and imports them when asked", async () => {
    const r1 = await runMediumImport([DRAFT], [], db.deps, opts);
    expect(r1.items[0].outcome).toBe("skipped_draft");
    expect(db.sources.size).toBe(0);
    const r2 = await runMediumImport([DRAFT], [], db.deps, { ...opts, includeDrafts: true });
    expect(r2.items[0].outcome).toBe("created");
  });

  it("reports a file that fails to parse and carries on", async () => {
    const r = await runMediumImport([{ name: "posts/junk.html", html: "<p>no</p>" }, POST], ["x.txt: skipped"], db.deps, opts);
    expect(r.items.map((i) => i.outcome)).toEqual(["failed", "created"]);
    expect(r.problems).toEqual(["x.txt: skipped"]);
    expect(db.log.filter((l) => l.fn === "journal_import_log")).toHaveLength(2);
  });
});

describe("re-imports never duplicate", () => {
  it("the same export twice: the second run changes nothing", async () => {
    await runMediumImport([POST], [], db.deps, opts);
    const before = { articles: db.articles.size, media: db.media.size, objects: db.objects.size };
    const r = await runMediumImport([POST], [], db.deps, opts);
    expect(r.items[0].outcome).toBe("unchanged");
    expect({ articles: db.articles.size, media: db.media.size, objects: db.objects.size }).toEqual(before);
  });

  it("a run interrupted before saving the content is resumed on retry, reusing the article and images", async () => {
    db.failNext.add("journal_import_apply");
    const r1 = await runMediumImport([POST], [], db.deps, opts);
    expect(r1.items[0].outcome).toBe("failed");
    expect(r1.items[0].messages.at(-1)!.text).toMatch(/Run the import again to retry; nothing will be duplicated/);
    const r2 = await runMediumImport([POST], [], db.deps, opts);
    expect(r2.items[0].outcome).toBe("created");
    expect(r2.items[0].articleId).toBe(r1.items[0].articleId);
    expect(db.articles.size).toBe(1);
    expect(db.media.size).toBe(1);
  });

  it("a stored-but-unregistered image is attached on retry, not uploaded twice", async () => {
    db.failNext.add("journal_register_media");
    const r1 = await runMediumImport([POST], [], db.deps, opts);
    expect(r1.items[0].messages.map((m) => m.text).join("\n")).toMatch(/stored but couldn't be attached/);
    // The content changed so it re-runs (untouched → update).
    const edited = { ...POST, html: POST.html.replace("The end.", "The very end.") };
    const r2 = await runMediumImport([edited], [], db.deps, opts);
    expect(r2.items[0].outcome).toBe("updated");
    expect(db.objects.size).toBe(1);
    expect(db.media.size).toBe(1);
  });

  it("a post changed on Medium but edited in WLA is left alone and reported", async () => {
    await runMediumImport([POST], [], db.deps, opts);
    db.sources.get("1a2b3c4d5e6f")!.edited = true;
    const r = await runMediumImport([{ ...POST, html: POST.html.replace("The end.", "Changed upstream.") }], [], db.deps, opts);
    expect(r.items[0].outcome).toBe("skipped_edited");
    expect(r.items[0].messages[0].text).toMatch(/left alone/);
  });
});

describe("conflicts and failures are reported", () => {
  it("a slug already in use is renamed and reported", async () => {
    db.slugs.add("less-authority");
    const r = await runMediumImport([POST], [], db.deps, opts);
    expect(r.items[0].finalSlug).toBe("less-authority-2");
    expect(r.items[0].messages.map((m) => m.text).join("\n")).toMatch(/“less-authority” was already in use, so this article uses “less-authority-2”/);
  });

  it("a database refusal is a failed item, not a crash", async () => {
    db.failNext.add("journal_import_prepare");
    const r = await runMediumImport([POST], [], db.deps, opts);
    expect(r.items[0].outcome).toBe("failed");
    expect(r.totals.failed).toBe(1);
  });

  it("a run that cannot start (not an editor) says so", async () => {
    db.failNext.add("journal_import_start");
    const r = await runMediumImport([POST], [], db.deps, opts);
    expect(r.runId).toBeNull();
    expect(r.problems.at(-1)).toMatch(/Only editors can import/);
  });
});

describe("images are checked by content, and only Medium's CDN is fetched", () => {
  it("identifies raster images by their first bytes", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe("image/png");
    expect(sniffImage(JPEG)?.mime).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("GIF89a"))?.mime).toBe("image/gif");
    expect(sniffImage(new TextEncoder().encode("RIFF1234WEBPVP8"))?.mime).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(imageProblem(new TextEncoder().encode("<html>"))).toMatch(/PNG, JPEG, WebP or GIF/);
    expect(imageProblem(new Uint8Array(0))).toMatch(/empty/);
  });

  it("keeps every file inside its article's folder", () => {
    expect(mediaPath("art-1", "../../etc/Passwd Photo", "png")).toBe("art-1/etc-passwd-photo.png");
  });

  it("refuses anything but https Medium image hosts", () => {
    expect(isMediumImageUrl("https://cdn-images-1.medium.com/max/800/1*x.jpeg")).toBe(true);
    expect(isMediumImageUrl("https://miro.medium.com/v2/x.png")).toBe(true);
    for (const bad of ["http://cdn-images-1.medium.com/x", "https://169.254.169.254/latest", "https://medium.com.evil.org/x", "https://user:pw@miro.medium.com/x", "https://miro.medium.com:8443/x", "file:///etc/passwd"]) {
      expect(isMediumImageUrl(bad)).toBe(false);
    }
  });

  it("does not follow a redirect off Medium's CDN", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }));
    const r = await fetchMediumImage("https://miro.medium.com/x.png", fetchImpl as unknown as typeof fetch);
    expect(r).toEqual({ error: "it isn't hosted on Medium's image servers" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops reading past 10 MB and rejects non-images", async () => {
    const big = vi.fn(async () => new Response(new Uint8Array(11 * 1024 * 1024), { status: 200 }));
    expect(await fetchMediumImage("https://miro.medium.com/x.png", big as unknown as typeof fetch)).toEqual({ error: "it is larger than 10 MB" });
    const html = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect(await fetchMediumImage("https://miro.medium.com/x.png", html as unknown as typeof fetch)).toEqual({ error: "it isn't a PNG, JPEG, WebP or GIF image" });
  });
});
