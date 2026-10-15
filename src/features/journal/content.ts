import sanitizeHtml from "sanitize-html";

/**
 * ARTICLE CONTENT RULES (D-123).
 *
 * Article bodies are HTML restricted to a fixed allowlist — the same set the
 * studio editor can produce. The allowlist is applied:
 *
 *   1. when a revision is saved (server action), before it reaches the DB;
 *   2. when an article is rendered, publicly or in preview — so a body that
 *      reached the database some other way is still rendered safely;
 *   3. to every imported Medium post.
 *
 * The database adds a third, cruder refusal of obvious payloads
 * (`private.journal_body_unsafe`) for requests that skip the app entirely.
 */

/** The only image source an article may use: WLA's own media route (absolute in the public API, D-131). */
export const MEDIA_SRC = /^\/api\/journal\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const mediaUrl = (id: string) => `/api/journal/media/${id}`;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "h2", "h3", "h4", "blockquote", "ul", "ol", "li", "strong", "em", "u", "s",
    "code", "pre", "a", "figure", "figcaption", "img", "hr", "br",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel"],
    img: ["src", "alt"],
    ol: ["start"],
  },
  allowedSchemes: ["https", "http", "mailto"],
  allowedSchemesByTag: { img: [] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  // The article title is the page's h1; body headings start at h2.
  transformTags: {
    h1: "h2",
    h5: "h4",
    h6: "h4",
    b: "strong",
    i: "em",
    strike: "s",
    del: "s",
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...(attribs.href ? { href: attribs.href } : {}),
        ...(attribs.title ? { title: attribs.title } : {}),
        // External links never get the opener; internal ones need nothing.
        ...(attribs.href && /^https?:/i.test(attribs.href) ? { rel: "noopener noreferrer" } : {}),
      },
    }),
  },
  exclusiveFilter: (frame) =>
    // An image is kept only if it is WLA media; anything else (a hotlinked or
    // tracking image, a data: URI) is dropped rather than rewritten.
    frame.tag === "img" && !MEDIA_SRC.test(frame.attribs.src ?? ""),
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "svg", "math"],
};

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html ?? "", OPTIONS)
    // Empty paragraphs the editor leaves behind carry nothing.
    .replace(/<p>(\s|&nbsp;|<br \/>)*<\/p>/g, "")
    .trim();
}

/** Plain text of an article body, for search snippets, word counts and SEO. */
export function htmlToText(html: string): string {
  // Block ends become spaces first, or "<h2>A</h2><p>b</p>" reads as "Ab".
  const spaced = (html ?? "").replace(/<\/(p|h[1-6]|li|blockquote|pre|figcaption|figure)>|<(br|hr)\b[^>]*>/gi, "$& ");
  return sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Reading time in whole minutes at 230 words a minute; never "0 min". */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 230));
}

const RESERVED = new Set(["category", "tag", "search", "media", "feed", "sitemap", "sitemap.xml"]);
export const SLUG_RULE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A URL slug from a title. Matches the database's `private.journal_slug_ok`. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  if (!slug) return "";
  return RESERVED.has(slug) ? `${slug}-article` : slug;
}

export function slugProblem(slug: string): string | null {
  if (!slug) return "Add a URL slug.";
  if (slug.length > 120) return "Keep the slug under 120 characters.";
  if (!SLUG_RULE.test(slug)) return "Use lower-case letters, numbers and single hyphens only.";
  if (RESERVED.has(slug)) return "That word is used by the Journal itself. Choose another.";
  return null;
}

/** Tags are stored as slugs (the database drops anything else). */
export function normaliseTags(input: string): string[] {
  const tags = input
    .split(",")
    .map((t) => slugify(t).slice(0, 40).replace(/-+$/g, ""))
    .filter(Boolean);
  return [...new Set(tags)].sort();
}

export function tagLabel(tag: string): string {
  return tag.replace(/-/g, " ");
}
