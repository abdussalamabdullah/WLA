# Connecting the Lovable `/journal` to the WLA Journal API

**Status (2026-10-15):** ready to paste into Lovable. **Not yet in the Lovable
project.** The Lovable project wasn't reachable from the WLA workspace (no local
export or repository, no open editor session), so nothing in Lovable has been
changed. The code below was built and verified in an isolated copy of Lovable's
usual stack (React 18, Vite 5, React Router 6, TanStack Query 5, Tailwind 3,
shadcn colour variables). It is **awaiting a reachable WLA API URL**.

WLA stays the CMS and the only content store (D-131). Lovable only reads the
public, read-only API in `JOURNAL-PUBLIC-API.md`. It uses no key, no cookie and
no Supabase connection.

## 1. What changes in Lovable

| Change | Where |
| --- | --- |
| **Add** 11 files and 1 stylesheet (section 4) | `src/lib/journal/*`, `src/components/journal/*`, `src/pages/JournalArticle.tsx`, `src/journal-prose.css` |
| **Replace only the hard-coded Featured / Explore / Latest sections** of the existing Journal page with `<JournalFeed />`. **Keep** its hero/intro, closing line, header, footer and layout. | the existing `/journal` page component |
| **Add one route**: `/journal/:slug` → `JournalArticle`, next to the existing `/journal` route | `src/App.tsx` (or wherever routes live) |
| **Import** `./journal-prose.css` once | `src/main.tsx` |
| **Install** `dompurify` (3.2.6) | dependencies |
| **Set** `VITE_WLA_API_BASE` (section 2) | Lovable environment / `.env` |

Assumes `@tanstack/react-query` with a `QueryClientProvider` (standard in
Lovable projects) and the `@/` → `src/` alias. If the project uses
react-helmet-async, `useJournalMeta` can be swapped for `<Helmet>` with the same
values.

**Styling:** components use the shadcn colour classes that Lovable projects
define (`text-foreground`, `text-muted-foreground`, `border-border`,
`bg-primary`, `font-serif`), so they inherit the site's existing palette and
fonts. Introduce no new colours. Adjust spacing and type sizes to match the
current Journal page if they differ.

## 2. API base URL

| Setting | Value | Notes |
| --- | --- | --- |
| `VITE_WLA_API_BASE` | the WLA app's **public HTTPS origin**, e.g. `https://<wla-app-domain>` | **Required.** Public, not a secret. The WLA app must be deployed with the Journal migration and reachable over HTTPS. **No such URL exists yet**, so this guide doesn't name one. |
| `VITE_PUBLIC_SITE_URL` | the public website's own origin | Optional. Used for canonical URLs; defaults to the page's own origin. |
| WLA side: `NEXT_PUBLIC_SITE_URL` | the WLA app's public origin | Makes the API's absolute image URLs use the public host. |

The client **refuses** (shows the calm "unavailable" message and sends no request):
- an unset value or one that isn't a URL;
- any non-HTTPS URL;
- `localhost`/`127.0.0.1` in a published build.

`http://localhost:3000` is accepted **only** in local development. A hosted
site can never call a developer's machine, and an HTTPS page couldn't call
`http://localhost` anyway.

Never put a Supabase anon key, service-role key or any token in Lovable for the
Journal.

## 3. Lovable prompt (paste as-is, then add the files)

> Connect the existing /journal page to the WLA Journal API. Do not redesign the
> site or change any other page. Keep the current /journal hero/intro and closing
> text, header, footer, fonts and colours exactly as they are. Replace only the
> hard-coded featured, "Explore the Journal" and "Latest from the Journal" content
> with the `<JournalFeed />` component from `src/components/journal/JournalFeed.tsx`.
> Add a route `/journal/:slug` that renders `src/pages/JournalArticle.tsx`.
> Import `src/journal-prose.css` in `src/main.tsx`. Add the dependency
> `dompurify@3.2.6`. Read the API origin from `import.meta.env.VITE_WLA_API_BASE`
> (already handled in `src/lib/journal/config.ts`). Do not add any API key, token,
> Supabase client or cookie handling for the Journal. Do not invent article fields:
> use only the types in `src/lib/journal/types.ts`.

## 4. Files (verified versions)

### `src/lib/journal/config.ts`

```ts
/**
 * Where the WLA Journal API lives. WLA is the only store of Journal content;
 * this site only reads its public API (contract: WLA docs/JOURNAL-PUBLIC-API.md).
 *
 * VITE_WLA_API_BASE is the WLA app's public ORIGIN, e.g. https://academy.example
 * — a plain public setting, not a secret. No key, token or cookie is ever used.
 *
 * Refused on purpose (the Journal then shows "unavailable" and makes no request):
 *  - unset or not a URL;
 *  - anything but https, except http://localhost during local development;
 *  - a localhost address in a published (production) build.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveApiBase(raw: string | undefined, isDev: boolean): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (local && !isDev) return null;
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
  return url.origin;
}

export function journalApiBase(): string | null {
  return resolveApiBase(import.meta.env.VITE_WLA_API_BASE, import.meta.env.DEV);
}

/** Where this site's own pages live, for canonical URLs. Optional. */
export function siteOrigin(): string {
  const configured = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim().replace(/\/+$/, "");
  return configured || window.location.origin;
}

/** Appended to every Journal page title. Match the rest of the site. */
export const SITE_TITLE_SUFFIX = " | Within Lab Academy";
```

### `src/lib/journal/types.ts`

```ts
/** Exactly the fields of the WLA Journal API contract — nothing more. */
export type JournalImage = { url: string; alt: string };
export type JournalCategoryRef = { slug: string; name: string };
export type JournalTag = { slug: string; label: string };

export type JournalArticleSummary = {
  slug: string;
  title: string;
  excerpt: string | null;
  author: { name: string } | null;
  category: JournalCategoryRef | null;
  tags: JournalTag[];
  featuredImage: JournalImage | null;
  publishedAt: string | null;
  updatedAt: string | null;
  readingMinutes: number;
};

export type JournalArticle = JournalArticleSummary & {
  firstPublishedAt: string | null;
  bodyHtml: string;
  seo: { title: string; description: string | null; canonicalUrl: string | null };
  originalSource: { url: string; site: "medium" | "other" } | null;
};

export type JournalCategory = { slug: string; name: string; description: string | null };

export type JournalPage = {
  data: JournalArticleSummary[];
  pagination: { page: number; pageSize: number; hasMore: boolean };
};

export type ArticleResult =
  | { kind: "article"; article: JournalArticle }
  | { kind: "moved"; slug: string }
  | { kind: "not_found" };

export type ListQuery = { page: number; category: string | null; tag: string | null; q: string | null };
```

### `src/lib/journal/api.ts`

```ts
import { journalApiBase } from "./config";
import type { ArticleResult, JournalArticle, JournalCategory, JournalPage, JournalTag, ListQuery } from "./types";

/**
 * Read-only client for the WLA Journal API. Requests are sent WITHOUT
 * credentials (no cookies), carry no key, and time out — the API itself only
 * ever returns published, live content.
 */
export class JournalNotConfigured extends Error {}
export class JournalUnavailable extends Error {}

export const PAGE_SIZE = 12;
const TIMEOUT_MS = 8000;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isSlug = (s: string | null | undefined): s is string => !!s && s.length <= 120 && SLUG.test(s);

/** Visitor-typed URL parameters, made safe before they reach the API. */
export function normaliseQuery(p: URLSearchParams): ListQuery {
  const n = Number(p.get("page"));
  const q = (p.get("q") ?? "").trim().slice(0, 200);
  const category = p.get("category");
  const tag = p.get("tag");
  return {
    page: Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1,
    category: isSlug(category) ? category : null,
    tag: isSlug(tag) ? tag : null,
    q: q || null,
  };
}

async function request(path: string, params: Record<string, string | number | null> = {}, signal?: AbortSignal) {
  const base = journalApiBase();
  if (!base) throw new JournalNotConfigured();
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== "") url.searchParams.set(k, String(v));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { signal: ctrl.signal, credentials: "omit", headers: { Accept: "application/json" } });
  } catch {
    throw new JournalUnavailable();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function json(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new JournalUnavailable();
  }
}

export async function fetchArticles(q: ListQuery, signal?: AbortSignal): Promise<JournalPage> {
  const res = await request("/api/journal/articles", { page: q.page, pageSize: PAGE_SIZE, category: q.category, tag: q.tag, q: q.q }, signal);
  if (!res.ok) throw new JournalUnavailable();
  const body = (await json(res)) as Partial<JournalPage>;
  if (!Array.isArray(body.data) || !body.pagination) throw new JournalUnavailable();
  return body as JournalPage;
}

export async function fetchArticle(slug: string, signal?: AbortSignal): Promise<ArticleResult> {
  if (!isSlug(slug)) return { kind: "not_found" };
  const res = await request(`/api/journal/articles/${encodeURIComponent(slug)}`, {}, signal);
  if (res.status === 404) return { kind: "not_found" };
  if (!res.ok) throw new JournalUnavailable();
  const body = (await json(res)) as { data?: Partial<JournalArticle>; movedTo?: string };
  if (isSlug(body.movedTo)) return { kind: "moved", slug: body.movedTo };
  const a = body.data;
  if (!a || typeof a.slug !== "string" || typeof a.title !== "string" || typeof a.bodyHtml !== "string") throw new JournalUnavailable();
  return { kind: "article", article: a as JournalArticle };
}

export async function fetchCategories(signal?: AbortSignal): Promise<JournalCategory[]> {
  const res = await request("/api/journal/categories", {}, signal);
  if (!res.ok) throw new JournalUnavailable();
  const body = (await json(res)) as { data?: JournalCategory[] };
  return Array.isArray(body.data) ? body.data : [];
}

export async function fetchTags(signal?: AbortSignal): Promise<JournalTag[]> {
  const res = await request("/api/journal/tags", {}, signal);
  if (!res.ok) throw new JournalUnavailable();
  const body = (await json(res)) as { data?: JournalTag[] };
  return Array.isArray(body.data) ? body.data : [];
}

/** Retry a failed read once; never when the API is not configured. */
export const retryOnce = (count: number, error: unknown) => !(error instanceof JournalNotConfigured) && count < 1;

/** An image is shown only if it is served by the WLA Journal media route. */
export function isJournalMediaUrl(url: string | null | undefined): url is string {
  const base = journalApiBase();
  return !!base && !!url && url.startsWith(`${base}/api/journal/media/`);
}
```

### `src/lib/journal/sanitize.ts`

```ts
import DOMPurify from "dompurify";

import { isJournalMediaUrl } from "./api";

/**
 * Defence in depth: the API already sanitises bodyHtml to the Journal
 * allowlist. This applies the SAME allowlist again in the browser (never a
 * stricter one — images and links would be lost) and additionally drops any
 * image not served by the WLA Journal media route.
 */
const TAGS = ["p", "h2", "h3", "h4", "blockquote", "ul", "ol", "li", "strong", "em", "u", "s",
  "code", "pre", "a", "figure", "figcaption", "img", "hr", "br"];
const ATTRS_BY_TAG: Record<string, string[]> = { a: ["href", "title", "rel"], img: ["src", "alt"], ol: ["start"] };

let purifier: ReturnType<typeof DOMPurify> | null = null;

function instance() {
  if (purifier) return purifier;
  purifier = DOMPurify(window);
  purifier.addHook("uponSanitizeAttribute", (node, data) => {
    const allowed = ATTRS_BY_TAG[node.nodeName.toLowerCase()] ?? [];
    if (!allowed.includes(data.attrName)) data.keepAttr = false;
  });
  purifier.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    if (el.nodeName === "IMG" && !isJournalMediaUrl(el.getAttribute("src"))) {
      // An image must come from the Journal; a figure left empty goes too.
      const figure = el.closest("figure");
      el.remove();
      if (figure && !figure.querySelector("img")) figure.remove();
    }
    if (el.nodeName === "A" && /^https?:/i.test(el.getAttribute("href") ?? "")) {
      el.setAttribute("rel", "noopener noreferrer");
    }
  });
  return purifier;
}

export function sanitizeJournalHtml(html: string): string {
  return instance().sanitize(html ?? "", {
    ALLOWED_TAGS: TAGS,
    ALLOWED_ATTR: ["href", "title", "rel", "src", "alt", "start"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    // DOMPurify's default pattern with only http(s) and mailto schemes left:
    // relative links and plain values (e.g. <ol start="3">) still pass.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  }) as string;
}
```

### `src/lib/journal/format.ts`

```ts
/** Dates are shown in UK time, as the Journal is scheduled (WLA D-133). */
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : DATE.format(d);
}

/** True when `later` falls on a later UK calendar day than `earlier`. */
export function laterDay(earlier: string | null, later: string | null): boolean {
  if (!earlier || !later) return false;
  const a = new Date(earlier), b = new Date(later);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return DAY.format(b) > DAY.format(a);
}

export const readingTime = (minutes: number) => `${Math.max(1, Math.round(minutes || 0))} min read`;
```

### `src/lib/journal/meta.ts`

```ts
import { useEffect } from "react";

import { SITE_TITLE_SUFFIX } from "./config";

/**
 * Page title, description, canonical URL and Open Graph tags for Journal
 * pages. Each tag this sets is removed (or restored) when the page unmounts.
 * If the site already uses react-helmet-async, render the same values with
 * <Helmet> instead.
 */
export type JournalMeta = {
  title: string;
  description?: string | null;
  canonical?: string | null;
  image?: string | null;
  type?: "website" | "article";
  noindex?: boolean;
};

function upsert(selector: string, create: () => HTMLElement, attr: string, value: string | null | undefined, undo: (() => void)[]) {
  // No value: leave whatever the site already has (e.g. its default description).
  if (!value) return;
  let el = document.head.querySelector<HTMLElement>(selector);
  const existed = !!el;
  const previous = el?.getAttribute(attr) ?? null;
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
  undo.push(() => (existed && previous !== null ? el!.setAttribute(attr, previous) : el!.remove()));
}

const meta = (key: "name" | "property", name: string) => () => {
  const m = document.createElement("meta");
  m.setAttribute(key, name);
  return m;
};

export function useJournalMeta(m: JournalMeta) {
  const { title, description, canonical, image, type = "website", noindex = false } = m;
  useEffect(() => {
    const undo: (() => void)[] = [];
    const previousTitle = document.title;
    document.title = `${title}${SITE_TITLE_SUFFIX}`;
    upsert('meta[name="description"]', meta("name", "description"), "content", description, undo);
    upsert('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" }), "href", canonical, undo);
    upsert('meta[name="robots"]', meta("name", "robots"), "content", noindex ? "noindex" : null, undo);
    upsert('meta[property="og:title"]', meta("property", "og:title"), "content", title, undo);
    upsert('meta[property="og:description"]', meta("property", "og:description"), "content", description, undo);
    upsert('meta[property="og:url"]', meta("property", "og:url"), "content", canonical, undo);
    upsert('meta[property="og:image"]', meta("property", "og:image"), "content", image, undo);
    upsert('meta[property="og:type"]', meta("property", "og:type"), "content", type, undo);
    return () => {
      document.title = previousTitle;
      undo.reverse().forEach((f) => f());
    };
  }, [title, description, canonical, image, type, noindex]);
}
```

### `src/components/journal/JournalStates.tsx`

```tsx
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Shared look for focusable controls: visible focus, 44px target. */
export const focusRing =
  "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const control = `inline-flex min-h-11 items-center ${focusRing}`;

export function JournalLoading({ label = "Loading the Journal…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="py-12 text-muted-foreground">
      <span>{label}</span>
      <div aria-hidden="true" className="mt-6 space-y-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-6 w-3/4 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function JournalMessage({ title, children, action, headingLevel = 2 }: {
  title: string; children?: ReactNode; action?: ReactNode; headingLevel?: 1 | 2;
}) {
  const H = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className="py-12" role="status" aria-live="polite">
      <H className={headingLevel === 1 ? "font-serif text-3xl md:text-4xl" : "font-serif text-2xl"}>{title}</H>
      {children && <div className="mt-3 max-w-prose text-muted-foreground">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** The API is down, timed out, or not configured: the same calm message. */
export function JournalUnavailableMessage({ onRetry, headingLevel }: { onRetry?: () => void; headingLevel?: 1 | 2 }) {
  return (
    <JournalMessage
      headingLevel={headingLevel}
      title="The Journal is taking a moment"
      action={onRetry && (
        <button type="button" onClick={onRetry}
          className={`${control} border border-border px-5 text-sm font-medium hover:bg-muted`}>
          Try again
        </button>
      )}
    >
      <p>We couldn’t load the Journal just now. Please try again shortly.</p>
    </JournalMessage>
  );
}

export function BackToJournal() {
  return (
    <Link to="/journal" className={`${control} text-sm font-medium underline underline-offset-4`}>
      ← All Journal writing
    </Link>
  );
}
```

### `src/components/journal/ArticleListItem.tsx`

```tsx
import { Link } from "react-router-dom";

import { isJournalMediaUrl } from "@/lib/journal/api";
import { formatDate, readingTime } from "@/lib/journal/format";
import type { JournalArticleSummary } from "@/lib/journal/types";
import { control, focusRing } from "./JournalStates";

/**
 * One entry: Category label · Title · Short excerpt · Reading time ·
 * Publication date (Public Website Master §5). The lead entry runs larger.
 */
export function ArticleListItem({ article, lead = false }: { article: JournalArticleSummary; lead?: boolean }) {
  const date = formatDate(article.publishedAt);
  const image = isJournalMediaUrl(article.featuredImage?.url) ? article.featuredImage : null;
  const href = `/journal/${article.slug}`;
  return (
    <article className={lead ? "grid gap-6 md:grid-cols-2 md:items-center" : "grid gap-4 sm:grid-cols-[1fr_auto]"}>
      <div className={lead ? "" : "min-w-0"}>
        {article.category && (
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span className="sr-only">Section: </span>
            {article.category.name}
          </p>
        )}
        <h3 className={`mt-2 font-serif ${lead ? "text-3xl md:text-4xl" : "text-xl md:text-2xl"} leading-tight`}>
          <Link to={href} className={`${focusRing} hover:underline underline-offset-4`}>{article.title}</Link>
        </h3>
        {article.excerpt && <p className={`mt-3 max-w-prose text-muted-foreground ${lead ? "text-lg" : ""}`}>{article.excerpt}</p>}
        <p className="mt-3 text-sm text-muted-foreground">
          {article.author && <span>{article.author.name}</span>}
          {article.author && (date || article.readingMinutes) ? <span aria-hidden="true"> · </span> : null}
          {date && <time dateTime={article.publishedAt ?? undefined}>{date}</time>}
          {date && <span aria-hidden="true"> · </span>}
          <span>{readingTime(article.readingMinutes)}</span>
        </p>
        {article.tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-4 text-sm" aria-label="Topics">
            {article.tags.map((t) => (
              <li key={t.slug}>
                <Link to={`/journal?tag=${t.slug}`} className={`${control} text-muted-foreground underline underline-offset-4`}>
                  #{t.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {image && (
        <Link to={href} tabIndex={-1} aria-hidden="true" className={lead ? "order-first md:order-none" : "hidden sm:block"}>
          <img
            src={image.url}
            alt=""
            loading={lead ? "eager" : "lazy"}
            decoding="async"
            className={lead ? "aspect-[4/3] w-full rounded-sm object-cover" : "h-28 w-40 rounded-sm object-cover"}
          />
        </Link>
      )}
    </article>
  );
}
```

### `src/components/journal/JournalFeed.tsx`

```tsx
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { fetchArticles, fetchCategories, fetchTags, normaliseQuery, retryOnce } from "@/lib/journal/api";
import type { ListQuery } from "@/lib/journal/types";
import { ArticleListItem } from "./ArticleListItem";
import { control, focusRing, JournalLoading, JournalMessage, JournalUnavailableMessage } from "./JournalStates";

/**
 * The live part of /journal: sections, search, the article list and paging.
 * Everything comes from the WLA Journal API; nothing here is hard-coded
 * content. Filters live in the URL (?category=, ?tag=, ?q=, ?page=), so every
 * view can be linked to and the back button works.
 */
const toSearch = (q: Partial<ListQuery>) => {
  const p = new URLSearchParams();
  if (q.category) p.set("category", q.category);
  if (q.tag) p.set("tag", q.tag);
  if (q.q) p.set("q", q.q);
  if (q.page && q.page > 1) p.set("page", String(q.page));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export function JournalFeed() {
  const [params, setParams] = useSearchParams();
  const query = normaliseQuery(params);
  const filtered = !!(query.category || query.tag || query.q);

  const categories = useQuery({ queryKey: ["journal", "categories"], queryFn: ({ signal }) => fetchCategories(signal), staleTime: 5 * 60_000, retry: retryOnce });
  const tags = useQuery({ queryKey: ["journal", "tags"], queryFn: ({ signal }) => fetchTags(signal), staleTime: 5 * 60_000, retry: retryOnce });
  const articles = useQuery({
    queryKey: ["journal", "articles", query],
    queryFn: ({ signal }) => fetchArticles(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: retryOnce,
  });

  const [draft, setDraft] = useState(query.q ?? "");
  useEffect(() => setDraft(query.q ?? ""), [query.q]);

  // After paging or filtering, move focus to the results heading.
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const key = toSearch(query);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus();
  }, [key]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = draft.trim().slice(0, 200);
    setParams(new URLSearchParams(toSearch({ ...query, q: q || null, page: 1 }).slice(1)));
  };

  const activeCategory = categories.data?.find((c) => c.slug === query.category) ?? null;
  const activeTag = tags.data?.find((t) => t.slug === query.tag) ?? null;
  const resultsTitle = query.q
    ? `Results for “${query.q}”`
    : activeCategory?.name ?? (query.tag ? `Tagged “${activeTag?.label ?? query.tag.replace(/-/g, " ")}”` : query.category ? "This section" : "Latest from the Journal");

  const list = articles.data?.data ?? [];
  const lead = !filtered && query.page === 1 ? list[0] : undefined;
  const rest = lead ? list.slice(1) : list;

  return (
    <div className="space-y-14">
      <form role="search" onSubmit={onSearch} className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="journal-search" className="block text-sm font-medium">Search the Journal</label>
          <input
            id="journal-search"
            type="search"
            name="q"
            maxLength={200}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`mt-1 min-h-11 w-full border border-border bg-background px-3 ${focusRing}`}
          />
        </div>
        <button type="submit" className={`${control} justify-center bg-primary px-5 text-sm font-medium text-primary-foreground`}>
          Search
        </button>
      </form>

      {categories.data && categories.data.length > 0 && (
        <section aria-labelledby="journal-explore">
          <h2 id="journal-explore" className="font-serif text-2xl">Explore the Journal</h2>
          <nav aria-label="Journal sections" className="mt-4">
            <ul className="grid gap-x-10 gap-y-2 md:grid-cols-3">
              {categories.data.map((c) => {
                const current = c.slug === query.category;
                return (
                  <li key={c.slug}>
                    <Link
                      to={`/journal${toSearch({ category: c.slug })}`}
                      aria-current={current ? "page" : undefined}
                      className={`${control} font-serif text-lg ${current ? "font-semibold underline underline-offset-4" : "hover:underline underline-offset-4"}`}
                    >
                      {c.name}
                      {current && <span className="ml-2 text-xs font-sans font-medium uppercase tracking-wider">(showing)</span>}
                    </Link>
                    {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                  </li>
                );
              })}
            </ul>
          </nav>
        </section>
      )}

      <section aria-labelledby="journal-results">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="journal-results" ref={heading} tabIndex={-1} className={`font-serif text-2xl ${focusRing}`}>{resultsTitle}</h2>
          {filtered && (
            <Link to="/journal" className={`${control} text-sm underline underline-offset-4`}>Show all writing</Link>
          )}
        </div>
        {activeCategory?.description && <p className="mt-2 max-w-prose text-muted-foreground">{activeCategory.description}</p>}

        {articles.isPending ? (
          <JournalLoading />
        ) : articles.isError ? (
          <JournalUnavailableMessage onRetry={() => articles.refetch()} />
        ) : list.length === 0 ? (
          query.page > 1 ? (
            <JournalMessage title="There’s nothing on this page">
              <p><Link to={`/journal${toSearch({ ...query, page: 1 })}`} className={`${control} underline underline-offset-4`}>Go to the first page</Link></p>
            </JournalMessage>
          ) : filtered ? (
            <JournalMessage title="Nothing matches yet">
              <p>Try another word or section, or <Link to="/journal" className="underline underline-offset-4">read everything in the Journal</Link>.</p>
            </JournalMessage>
          ) : (
            <JournalMessage title="New writing is on its way">
              <p>Nothing has been published in the Journal yet. Please check back soon.</p>
            </JournalMessage>
          )
        ) : (
          <div aria-busy={articles.isFetching} className={articles.isPlaceholderData ? "opacity-60" : undefined}>
            {lead && <div className="mt-8 border-b border-border pb-12"><ArticleListItem article={lead} lead /></div>}
            <ol className="mt-8 space-y-10" aria-label="Articles">
              {rest.map((a) => (
                <li key={a.slug} className="border-b border-border pb-10 last:border-0"><ArticleListItem article={a} /></li>
              ))}
            </ol>
          </div>
        )}

        {articles.data && (query.page > 1 || articles.data.pagination.hasMore) && (
          <nav aria-label="Journal pages" className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-sm">
            {query.page > 1 ? (
              <Link to={`/journal${toSearch({ ...query, page: query.page - 1 })}`} rel="prev" className={`${control} font-medium underline underline-offset-4`}>
                ← Newer writing
              </Link>
            ) : <span />}
            <span className="text-muted-foreground">Page {query.page}</span>
            {articles.data.pagination.hasMore ? (
              <Link to={`/journal${toSearch({ ...query, page: query.page + 1 })}`} rel="next" className={`${control} font-medium underline underline-offset-4`}>
                Earlier writing →
              </Link>
            ) : <span />}
          </nav>
        )}
      </section>

      {tags.data && tags.data.length > 0 && (
        <section aria-labelledby="journal-topics">
          <h2 id="journal-topics" className="font-serif text-xl">Topics</h2>
          <ul className="mt-3 flex flex-wrap gap-x-5 text-sm">
            {tags.data.map((t) => (
              <li key={t.slug}>
                <Link
                  to={`/journal${toSearch({ tag: t.slug })}`}
                  aria-current={t.slug === query.tag ? "page" : undefined}
                  className={`${control} underline underline-offset-4 ${t.slug === query.tag ? "font-semibold" : "text-muted-foreground"}`}
                >
                  #{t.label}{t.slug === query.tag && <span className="sr-only"> (showing)</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

### `src/pages/Journal.tsx`

```tsx
import { useSearchParams } from "react-router-dom";

import { JournalFeed } from "@/components/journal/JournalFeed";
import { siteOrigin } from "@/lib/journal/config";
import { normaliseQuery } from "@/lib/journal/api";
import { useJournalMeta } from "@/lib/journal/meta";

/**
 * /journal. In Lovable: KEEP the existing page's hero/intro and closing
 * sections exactly as they are, and replace only the hard-coded Featured /
 * Explore / Latest sections with <JournalFeed />. The intro and closing below
 * are the Public Website Master §5 copy, used here so the harness looks real.
 */
export default function Journal() {
  const [params] = useSearchParams();
  const q = normaliseQuery(params);
  // Section pages are canonical; search, tag and paging views point at /journal.
  const canonical = `${siteOrigin()}/journal${q.category && !q.q && !q.tag ? `?category=${q.category}` : ""}`;
  useJournalMeta({
    title: "Journal",
    description: "Writing that notices what is easy to miss.",
    canonical,
    noindex: !!q.q,
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 md:px-8 md:py-20">
      {/* KEEP the existing /journal intro here. */}
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl md:text-5xl">Writing that notices what is easy to miss.</h1>
        <p className="mt-6 text-lg text-muted-foreground">The Journal is where WLA slows down.</p>
      </header>

      <div className="mt-14">
        <JournalFeed />
      </div>

      {/* KEEP the existing closing here. */}
      <p className="mt-20 font-serif text-xl">Read slowly. Notice closely. Carry something forward.</p>
    </main>
  );
}
```

### `src/pages/JournalArticle.tsx`

```tsx
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { BackToJournal, control, JournalLoading, JournalMessage, JournalUnavailableMessage } from "@/components/journal/JournalStates";
import { fetchArticle, isJournalMediaUrl, retryOnce } from "@/lib/journal/api";
import { siteOrigin } from "@/lib/journal/config";
import { formatDate, laterDay, readingTime } from "@/lib/journal/format";
import { useJournalMeta } from "@/lib/journal/meta";
import { sanitizeJournalHtml } from "@/lib/journal/sanitize";
import type { JournalArticle as Article } from "@/lib/journal/types";

/**
 * /journal/:slug — one published article from the WLA Journal API. Drafts,
 * scheduled-but-not-live, unpublished and archived articles are a 404 from
 * the API, shown here as "not found", whatever slug a visitor guesses.
 */
export default function JournalArticle() {
  const { slug = "" } = useParams();
  const result = useQuery({ queryKey: ["journal", "article", slug], queryFn: ({ signal }) => fetchArticle(slug, signal), staleTime: 30_000, retry: retryOnce });

  if (result.isPending) {
    return <Shell><JournalLoading label="Loading the article…" /><Meta title="Journal" /></Shell>;
  }
  if (result.isError) {
    return <Shell><JournalUnavailableMessage headingLevel={1} onRetry={() => result.refetch()} /><BackToJournal /><Meta title="Journal" noindex /></Shell>;
  }
  if (result.data.kind === "moved") return <Navigate to={`/journal/${result.data.slug}`} replace />;
  if (result.data.kind === "not_found") {
    return (
      <Shell>
        <Meta title="Article not found" noindex />
        <JournalMessage headingLevel={1} title="We can’t find that article" action={<BackToJournal />}>
          <p>It may have moved, or it isn’t published. Everything that is published is in the Journal.</p>
        </JournalMessage>
      </Shell>
    );
  }
  return <ArticleView article={result.data.article} />;
}

function Meta(p: { title: string; noindex?: boolean }) {
  useJournalMeta({ title: p.title, noindex: p.noindex });
  return null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl px-4 py-12 md:px-8 md:py-20">{children}</main>;
}

function ArticleView({ article: a }: { article: Article }) {
  const body = useMemo(() => sanitizeJournalHtml(a.bodyHtml), [a.bodyHtml]);
  const image = isJournalMediaUrl(a.featuredImage?.url) ? a.featuredImage : null;
  const published = formatDate(a.publishedAt);
  const updated = laterDay(a.publishedAt, a.updatedAt) ? formatDate(a.updatedAt) : null;

  useJournalMeta({
    title: a.seo.title || a.title,
    description: a.seo.description ?? a.excerpt,
    canonical: a.seo.canonicalUrl ?? `${siteOrigin()}/journal/${a.slug}`,
    image: image?.url,
    type: "article",
  });

  return (
    <Shell>
      <article>
        <header>
          <BackToJournal />
          {a.category && (
            <p className="mt-8 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span className="sr-only">Section: </span>
              <Link to={`/journal?category=${a.category.slug}`} className={`${control} underline-offset-4 hover:underline`}>{a.category.name}</Link>
            </p>
          )}
          <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">{a.title}</h1>
          {a.excerpt && <p className="mt-5 text-xl text-muted-foreground">{a.excerpt}</p>}
          <p className="mt-6 text-sm text-muted-foreground">
            {a.author && <>By <span className="text-foreground">{a.author.name}</span><span aria-hidden="true"> · </span></>}
            {published && <time dateTime={a.publishedAt ?? undefined}>{published}</time>}
            {published && <span aria-hidden="true"> · </span>}
            {readingTime(a.readingMinutes)}
            {updated && <><span aria-hidden="true"> · </span>Updated <time dateTime={a.updatedAt ?? undefined}>{updated}</time></>}
          </p>
          {a.originalSource && (
            <p className="mt-2 text-sm text-muted-foreground">
              First published on{" "}
              <a href={a.originalSource.url} rel="noopener noreferrer" className={`${control} underline underline-offset-4`}>
                {a.originalSource.site === "medium" ? "Medium" : "another site"}
              </a>
            </p>
          )}
        </header>

        {image && (
          <figure className="mt-10">
            <img src={image.url} alt={image.alt} className="w-full rounded-sm" decoding="async" />
          </figure>
        )}

        {/* Sanitised twice: by the WLA API, and again here (sanitize.ts). */}
        <div className="journal-prose mt-10" dangerouslySetInnerHTML={{ __html: body }} />

        {a.tags.length > 0 && (
          <footer className="mt-12 border-t border-border pt-6">
            <h2 className="text-sm font-medium">Topics</h2>
            <ul className="mt-2 flex flex-wrap gap-x-5 text-sm">
              {a.tags.map((t) => (
                <li key={t.slug}>
                  <Link to={`/journal?tag=${t.slug}`} className={`${control} text-muted-foreground underline underline-offset-4`}>#{t.label}</Link>
                </li>
              ))}
            </ul>
          </footer>
        )}
      </article>
      <div className="mt-12"><BackToJournal /></div>
    </Shell>
  );
}
```

### `src/journal-prose.css`

```css
/* Long-form Journal article body. Uses the site's own colour variables
   (shadcn: --foreground, --muted-foreground, --border, --primary) and its serif
   — no new colours. Covers every element the WLA API can return. */
.journal-prose { font-size: 1.125rem; line-height: 1.75; max-width: 68ch; }
.journal-prose > * + * { margin-top: 1.25em; }
.journal-prose h2, .journal-prose h3, .journal-prose h4 { font-family: theme(fontFamily.serif); line-height: 1.25; margin-top: 2em; }
.journal-prose h2 { font-size: 1.75rem; }
.journal-prose h3 { font-size: 1.375rem; }
.journal-prose h4 { font-size: 1.125rem; font-weight: 600; }
.journal-prose a { text-decoration: underline; text-underline-offset: 4px; }
.journal-prose a:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; border-radius: 2px; }
.journal-prose blockquote { border-left: 3px solid hsl(var(--border)); padding-left: 1.25em; font-family: theme(fontFamily.serif); font-style: italic; }
.journal-prose ul { list-style: disc; padding-left: 1.5em; }
.journal-prose ol { list-style: decimal; padding-left: 1.5em; }
.journal-prose li + li { margin-top: 0.5em; }
.journal-prose strong { font-weight: 600; }
.journal-prose code { font-size: 0.9em; background: hsl(var(--muted)); padding: 0.1em 0.3em; border-radius: 3px; }
.journal-prose pre { overflow-x: auto; background: hsl(var(--muted)); padding: 1em; border-radius: 4px; font-size: 0.9em; }
.journal-prose pre code { background: none; padding: 0; }
.journal-prose hr { border: 0; border-top: 1px solid hsl(var(--border)); margin: 2.5em 0; }
.journal-prose figure { margin: 2em 0; }
.journal-prose img { max-width: 100%; height: auto; border-radius: 2px; }
.journal-prose figcaption { margin-top: 0.5em; font-size: 0.875rem; color: hsl(var(--muted-foreground)); }
```

## 5. Behaviour

- **List** (`/journal`):
  - URL-driven filters `?category=`, `?tag=`, `?q=` and `?page=`, so every view can be linked and the back button works. Values are validated before they reach the API.
  - Newest first; on the unfiltered first page the newest article runs larger as the lead. The API has no "featured" flag, so none is invented.
  - Each entry shows: category · title · excerpt · author · UK date · reading time · tags, plus the featured image where present.
  - "Explore the Journal" lists the API's categories with their descriptions; "Topics" lists its tags. The current one is marked in words ("(showing)") and with `aria-current`, not by colour.
  - Paging is "← Newer writing" / "Earlier writing →" (the API gives `hasMore`, no total). After paging or filtering, focus moves to the results heading.
- **Article** (`/journal/:slug`):
  - Shows: section, title (h1), standfirst, byline, date, reading time, "Updated" (only on a later UK day), "First published on Medium", featured image with its alt text, the body, and topics.
  - An old slug navigates (replace) to `movedTo`.
- **Safety:**
  - The body is sanitised by the API and again in the browser to the **same** allowlist.
  - Images are shown only from `<api>/api/journal/media/`.
  - External links get `rel="noopener noreferrer"`.
  - Requests use `credentials: "omit"` and time out after 8 s.
- **States:**
  - **Loading:** a skeleton.
  - **Empty:** "nothing published yet", "nothing matches", or "nothing on this page".
  - **Unavailable:** for 503, network error, timeout or missing configuration — a calm message with **Try again**. One automatic retry, none when not configured.
  - **Not found:** for any 404 (unknown, draft, scheduled, unpublished or archived slugs look the same), marked `noindex`.
- **Metadata:**
  - **Title:** `<title> | Within Lab Academy` (change `SITE_TITLE_SUFFIX` to match the site).
  - **Description:** `seo.description` or the excerpt.
  - **Canonical:** `seo.canonicalUrl`, else `<site>/journal/<slug>`. Section pages keep `?category=`; search is `noindex`.
  - **Open Graph:** `og:title`, `og:description`, `og:url`, `og:image`, `og:type`.
- **Not covered:**
  - Lovable renders on the client, so crawlers that don't run JavaScript and link-preview bots won't see per-article titles or images (the site's defaults appear instead).
  - The API's 30 s CDN cache means a newly published article can take about a minute to appear.

## 6. Verification

**Verified (isolated copy of Lovable's usual stack, 2026-10-15):**
- `tsc --noEmit`: exit 0.
- Unit and page tests: **41/41**. They cover:
  - configuration rules;
  - parameter normalisation;
  - requests with no credentials;
  - 503, network failure, malformed JSON, wrong shape and timeout all map to "unavailable";
  - 404 and `movedTo`;
  - the sanitiser (every allowed element kept; scripts, handlers, styles, frames, `javascript:`/`data:`/`tel:` links and foreign images removed);
  - UK dates;
  - every page state;
  - filters, search and paging;
  - metadata.
- **Mutation checks:** accepting any image URL, sending cookies, or allowing localhost in a published build each made tests fail.
- **Real browser (headless Chrome), 53/53, run twice:**
  - At 1440px and 390px:
    - list and article render every contract field;
    - every supported format renders;
    - images load through the media redirect;
    - no horizontal overflow;
    - every control is at least 44px tall;
    - keyboard focus is visible.
  - Paging, section/tag filters and search work, and focus moves to the results heading.
  - A hostile body never ran.
  - The renamed-slug redirect works, and guessed slugs show not-found with `noindex`.
  - **Against the real local WLA API** (cross-origin from another port): every endpoint returned 200 with no CORS error and no credentials. It showed the empty state (nothing is published locally), and a guessed slug was not-found.
  - 503 and an unreachable API each showed the unavailable message with Try again.
  - A **production build configured with `http://localhost:3000` refused it and sent no request**.
- **Draft privacy at the API itself:** verified against the real local database on 2026-10-14 with real test articles, since removed. Drafts, scheduled-not-yet-due and unpublished articles returned 404 by slug and never appeared in list or search.

**Still to check in Lovable, once it has a reachable API:**
1. It builds in Lovable with the project's real dependencies and router.
2. The existing hero, closing, header, footer and fonts are unchanged; spacing matches the current design.
3. Real published articles show on `/journal` and `/journal/<slug>`; images load from the deployed WLA host.
4. The same checks at 390px and 1440px on the Lovable preview.
5. A draft's slug, typed by hand, shows not-found.
6. Lovable's own SEO/Helmet setup doesn't conflict with `useJournalMeta`.

## 7. Next step

The WLA app with the Journal migration must be deployed somewhere reachable over
HTTPS (for example staging). That is a separate, approved deployment step. Then:
1. Set `VITE_WLA_API_BASE` in Lovable to that origin, and `NEXT_PUBLIC_SITE_URL` on that WLA deployment.
2. Publish at least one article there.
3. Apply the changes above in Lovable and run the checklist in section 6.
