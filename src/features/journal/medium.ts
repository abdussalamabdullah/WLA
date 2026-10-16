import { createHash } from "node:crypto";
import { parseDocument } from "htmlparser2";
import { unzipSync } from "fflate";

import { slugify } from "./content";

/**
 * MEDIUM EXPORT PARSER (D-129). Pure: no network, no database.
 *
 * Reads the archive Medium produces under Settings → "Download your
 * information": a zip whose `posts/` folder holds one HTML file per post,
 * marked up as an h-entry —
 *
 *   h1.p-name                      title
 *   section[data-field=subtitle]   subtitle (→ excerpt)
 *   section[data-field=body]       body: .graf paragraphs, headings, figures…
 *   footer a.p-author              author name and profile URL
 *   footer time.dt-published       original publication date (absent on drafts)
 *   footer a.p-canonical           canonical URL, ending in the post id
 *
 * The body is rebuilt tag by tag into the Journal's allowlist rather than
 * cleaned, so anything this file does not recognise is reported, not kept.
 * Images become numbered markers; the importer downloads them into WLA media
 * and only then is the HTML sanitised (content.ts).
 */

type Node = {
  type: string;
  data?: string;
  name?: string;
  attribs?: Record<string, string>;
  children?: Node[];
};

export type ImportMessage = {
  level: "info" | "warning" | "error";
  /** What needs a person to look at it, in an editor's words. */
  text: string;
};

export type ParsedImage = {
  index: number;
  src: string;
  alt: string;
  caption: string;
};

export type ParsedPost = {
  file: string;
  sourceId: string;
  isDraft: boolean;
  title: string;
  excerpt: string | null;
  slug: string;
  /** Body HTML with `<!--wla-img:N-->` markers where images go. */
  bodyWithMarkers: string;
  images: ParsedImage[];
  /** Index of an image placed before any text — used as the featured image. */
  leadImage: number | null;
  authorName: string | null;
  authorUrl: string | null;
  publishedAt: string | null;
  canonicalUrl: string | null;
  sourceUrl: string | null;
  messages: ImportMessage[];
  /** Hash of the meaningful content, so re-exports of the same post match. */
  sourceHash: string;
};

const MEDIUM_HOSTS = /(^|\.)medium\.com$/i;
const ID_AT_END = /-([0-9a-f]{8,16})$/i;

const isTag = (n: Node) => n.type === "tag" || n.type === "script" || n.type === "style";
const cls = (n: Node) => ` ${n.attribs?.class ?? ""} `;
const hasClass = (n: Node, c: string) => cls(n).includes(` ${c} `);

function text(n: Node): string {
  if (n.type === "text") return n.data ?? "";
  if (n.name === "br") return "\n";
  return (n.children ?? []).map(text).join("");
}

function find(n: Node, test: (n: Node) => boolean): Node | null {
  if (isTag(n) && test(n)) return n;
  for (const c of n.children ?? []) {
    const hit = find(c, test);
    if (hit) return hit;
  }
  return null;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Medium's post id: the hex suffix of the canonical URL, the /p/<id> link, or the filename. */
function postId(canonical: string | null, footer: Node | null, file: string): string | null {
  const fromUrl = (u: string | null) => {
    if (!u) return null;
    try {
      const path = new URL(u).pathname.replace(/\/+$/, "");
      const p = path.match(/\/p\/([0-9a-f]{8,16})$/i);
      if (p) return p[1].toLowerCase();
      const tail = path.split("/").pop() ?? "";
      const m = tail.match(ID_AT_END);
      return m ? m[1].toLowerCase() : null;
    } catch {
      return null;
    }
  };
  const direct = fromUrl(canonical);
  if (direct) return direct;
  const pLink = footer ? find(footer, (n) => n.name === "a" && /\/p\/[0-9a-f]{8,16}/i.test(n.attribs?.href ?? "")) : null;
  const viaP = fromUrl(pLink?.attribs?.href ?? null);
  if (viaP) return viaP;
  const base = file.split("/").pop()?.replace(/\.html?$/i, "") ?? "";
  const m = base.match(ID_AT_END);
  return m ? m[1].toLowerCase() : null;
}

function slugFrom(canonical: string | null, title: string): string {
  if (canonical) {
    try {
      const tail = new URL(canonical).pathname.replace(/\/+$/, "").split("/").pop() ?? "";
      const withoutId = tail.replace(ID_AT_END, "");
      const s = slugify(decodeURIComponent(withoutId).replace(/-/g, " "));
      if (s && !/^p$/.test(s)) return s;
    } catch {
      /* fall through to the title */
    }
  }
  return slugify(title) || "imported-article";
}

class BodyWriter {
  images: ParsedImage[] = [];
  messages: ImportMessage[] = [];
  leadImage: number | null = null;
  private seenText = false;
  private sections = 0;
  /** The last text written, so a report can say where something was dropped. */
  private recent = "";

  private note(level: ImportMessage["level"], t: string) {
    this.messages.push({ level, text: t });
  }

  private image(img: Node, caption: string): string {
    const src = img.attribs?.src ?? "";
    if (!src) {
      this.note("warning", "An image with no source was skipped.");
      return "";
    }
    const index = this.images.length;
    const alt = clean(img.attribs?.alt ?? "");
    this.images.push({ index, src, alt, caption: clean(caption) });
    if (!this.seenText && this.leadImage === null) this.leadImage = index;
    if (!alt) {
      this.note("warning", `Image ${index + 1}${caption ? ` (“${clean(caption).slice(0, 60)}”)` : ""} has no alt text. Describe it before publishing.`);
    }
    return `<!--wla-img:${index}-->`;
  }

  private children(n: Node): string {
    return (n.children ?? []).map((c) => this.node(c)).join("");
  }

  private inline(tag: string, n: Node) {
    const inner = this.children(n);
    return inner.trim() ? `<${tag}>${inner}</${tag}>` : inner;
  }

  private link(n: Node): string {
    const href = (n.attribs?.href ?? "").trim();
    const inner = this.children(n);
    if (!href) return inner;
    if (!/^(https?:|mailto:|\/)/i.test(href)) {
      this.note("warning", `A link (“${clean(text(n)).slice(0, 60)}”) had an unusable address and was removed: ${href.slice(0, 80)}`);
      return inner;
    }
    try {
      if (/^https?:/i.test(href)) new URL(href);
    } catch {
      this.note("warning", `A broken link (“${clean(text(n)).slice(0, 60)}”) was removed: ${href.slice(0, 80)}`);
      return inner;
    }
    const host = hostOf(href);
    if (host && MEDIUM_HOSTS.test(host) && !/^(help|policy)\./i.test(host)) {
      this.note("info", `A link points back to Medium (${href.slice(0, 100)}). Update it if that post now lives on WLA.`);
    }
    return `<a href="${escapeAttr(href)}">${inner}</a>`;
  }

  node(n: Node): string {
    if (n.type === "text") {
      const t = n.data ?? "";
      if (t.trim()) {
        this.seenText = true;
        this.recent = (this.recent + " " + t).slice(-200);
      }
      return escapeText(t);
    }
    if (n.type === "comment" || n.type === "directive" || n.type === "cdata") return "";
    if (n.type === "script" || n.type === "style") return "";
    if (!isTag(n)) return "";

    const name = n.name ?? "";
    // The title and subtitle are repeated at the top of Medium's body.
    if (hasClass(n, "graf--title") || hasClass(n, "graf--subtitle")) return "";

    switch (name) {
      case "section":
        // Medium separates body sections with a divider; the first needs none.
        this.sections += 1;
        return (this.sections > 1 && hasClass(n, "section") ? "<hr>" : "") + this.children(n);
      case "hr":
        return hasClass(n, "section-divider") ? "" : "<hr>";
      case "p":
        return this.inline("p", n);
      case "h1":
      case "h2":
      case "h3":
        return this.inline("h2", n);
      case "h4":
        return this.inline("h3", n);
      case "h5":
      case "h6":
        return this.inline("h4", n);
      case "strong":
      case "b":
        return this.inline("strong", n);
      case "em":
      case "i":
        return this.inline("em", n);
      case "u":
        return this.inline("u", n);
      case "s":
      case "strike":
      case "del":
        return this.inline("s", n);
      case "code":
        return `<code>${escapeText(text(n))}</code>`;
      case "br":
        return "<br>";
      case "a":
        if (hasClass(n, "mixtapeImage")) return "";
        return this.link(n);
      case "blockquote":
        return this.inline("blockquote", n);
      case "ul":
      case "ol":
        return `<${name}>${this.children(n)}</${name}>`;
      case "li":
        return `<li>${this.children(n)}</li>`;
      case "pre":
        this.seenText = true;
        return `<pre>${escapeText(text(n))}</pre>`;
      case "figure": {
        const iframe = find(n, (c) => c.name === "iframe");
        if (iframe) return this.unsupported("An embedded item (video, gist, tweet or similar)");
        const img = find(n, (c) => c.name === "img");
        if (!img) return this.children(n);
        const cap = find(n, (c) => c.name === "figcaption");
        return this.image(img, cap ? text(cap) : "");
      }
      case "img":
        return this.image(n, "");
      case "iframe":
      case "video":
      case "audio":
      case "object":
      case "embed":
      case "form":
      case "svg":
      case "canvas":
        return this.unsupported(`A <${name}> element`);
      case "div":
        if (hasClass(n, "graf--mixtapeEmbed")) {
          const a = find(n, (c) => c.name === "a" && !hasClass(c, "mixtapeImage") && !!c.attribs?.href);
          const label = a ? clean(text(find(a, (c) => c.name === "strong") ?? a)) : "";
          this.note("info", `A link card${label ? ` (“${label.slice(0, 60)}”)` : ""} became a plain link.`);
          return a ? `<p>${this.link({ ...a, children: [{ type: "text", data: label || a.attribs?.href || "" }] })}</p>` : "";
        }
        return this.children(n);
      default:
        // Containers (span, div, article…) are unwrapped; their content stays.
        return this.children(n);
    }
  }

  private unsupported(what: string): string {
    const near = clean(this.recent).slice(-60);
    this.note("warning", `${what} was not imported${near ? ` (after “…${near}”)` : ""}. Add it by hand if it matters.`);
    return "";
  }
}

export function parseMediumPost(file: string, html: string): ParsedPost | { file: string; error: string } {
  const doc = parseDocument(html, { decodeEntities: true }) as unknown as Node;
  const article = find(doc, (n) => n.name === "article") ?? doc;
  const titleNode = find(article, (n) => hasClass(n, "p-name")) ?? find(doc, (n) => n.name === "title");
  const title = clean(titleNode ? text(titleNode) : "");
  const bodyNode = find(article, (n) => n.attribs?.["data-field"] === "body" || hasClass(n, "e-content"));
  if (!title && !bodyNode) return { file, error: "This file doesn't look like a Medium post." };
  if (!bodyNode) return { file, error: "The post has no body section." };

  const subtitleNode = find(article, (n) => n.attribs?.["data-field"] === "subtitle" || hasClass(n, "p-summary"));
  const footer = find(article, (n) => n.name === "footer");
  const authorNode = footer ? find(footer, (n) => hasClass(n, "p-author")) : null;
  const timeNode = footer ? find(footer, (n) => hasClass(n, "dt-published")) : null;
  const canonicalNode = footer ? find(footer, (n) => hasClass(n, "p-canonical")) : null;
  const canonicalUrl = canonicalNode?.attribs?.href ?? null;

  const sourceId = postId(canonicalUrl, footer, file);
  if (!sourceId) return { file, error: "Couldn't find the Medium post id, so a re-import couldn't be matched." };

  const writer = new BodyWriter();
  const bodyWithMarkers = writer.node(bodyNode).replace(/(<hr>\s*){2,}/g, "<hr>").replace(/^(\s*<hr>)+/, "");
  const publishedRaw = timeNode?.attribs?.datetime ?? null;
  const publishedAt = publishedRaw && !Number.isNaN(Date.parse(publishedRaw)) ? new Date(publishedRaw).toISOString() : null;
  const isDraft = /(^|\/)draft_/i.test(file) || !publishedAt;
  const excerpt = subtitleNode ? clean(text(subtitleNode)) || null : null;
  const messages = [...writer.messages];
  if (!title) messages.push({ level: "warning", text: "The post had no title; one was made up for it. Rename it." });
  if (isDraft) messages.push({ level: "info", text: "This was an unpublished draft on Medium." });
  if (!authorNode) messages.push({ level: "info", text: "No author was recorded in the export. Set the byline by hand." });

  const authorName = authorNode ? clean(text(authorNode)) || null : null;
  const slug = slugFrom(canonicalUrl, title);
  const sourceHash = createHash("sha256")
    .update(JSON.stringify([title, excerpt, bodyWithMarkers, writer.images.map((i) => [i.src, i.alt, i.caption]), authorName, publishedAt, canonicalUrl]))
    .digest("hex");

  return {
    file,
    sourceId,
    isDraft,
    title: title || "Untitled Medium post",
    excerpt: excerpt ? excerpt.slice(0, 600) : null,
    slug,
    bodyWithMarkers,
    images: writer.images,
    leadImage: writer.leadImage,
    authorName,
    authorUrl: authorNode?.attribs?.href ?? null,
    publishedAt,
    canonicalUrl,
    sourceUrl: canonicalUrl,
    messages,
    sourceHash,
  };
}

/** Put the downloaded images into the body. A failed image's figure is removed. */
export function placeImages(
  bodyWithMarkers: string,
  images: ParsedImage[],
  placed: Map<number, { url: string }>,
  skip: Set<number> = new Set(),
): string {
  return bodyWithMarkers.replace(/<!--wla-img:(\d+)-->/g, (_, n) => {
    const i = Number(n);
    const img = images[i];
    const at = placed.get(i);
    if (!img || !at || skip.has(i)) return "";
    const alt = escapeAttr(img.alt || "");
    const caption = img.caption ? `<figcaption>${escapeText(img.caption)}</figcaption>` : "";
    return `<figure><img src="${at.url}" alt="${alt}">${caption}</figure>`;
  });
}

export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export { IMPORT_BODY_LIMIT } from "./import-limits";
const MAX_POST_BYTES = 5 * 1024 * 1024;
const MAX_POSTS = 1000;

export type ExportFile = { name: string; html: string };

/**
 * The HTML posts inside an upload: a Medium export zip, or individual .html
 * files. Only `posts/*.html` is decompressed, each with a size cap, so a
 * crafted archive cannot exhaust memory.
 */
export function readExport(uploads: { name: string; bytes: Uint8Array }[]): { files: ExportFile[]; problems: string[] } {
  const files: ExportFile[] = [];
  const problems: string[] = [];
  const decoder = new TextDecoder("utf-8");
  for (const u of uploads) {
    if (/\.zip$/i.test(u.name)) {
      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(u.bytes, {
          filter: (f) =>
            /(^|\/)posts\/[^/]+\.html?$/i.test(f.name) && f.originalSize <= MAX_POST_BYTES,
        });
      } catch {
        problems.push(`${u.name}: this isn't a readable zip file.`);
        continue;
      }
      const names = Object.keys(entries).sort();
      if (names.length === 0) problems.push(`${u.name}: no posts/*.html files were found. Is this Medium's export?`);
      for (const name of names) files.push({ name, html: decoder.decode(entries[name]) });
    } else if (/\.html?$/i.test(u.name)) {
      if (u.bytes.byteLength > MAX_POST_BYTES) {
        problems.push(`${u.name}: larger than 5 MB, skipped.`);
        continue;
      }
      files.push({ name: u.name, html: decoder.decode(u.bytes) });
    } else {
      problems.push(`${u.name}: not a .zip or .html file, skipped.`);
    }
  }
  if (files.length > MAX_POSTS) {
    problems.push(`Only the first ${MAX_POSTS} posts are imported in one run. Run the import again for the rest.`);
    files.length = MAX_POSTS;
  }
  return { files, problems };
}
