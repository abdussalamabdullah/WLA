# Journal public API — contract for the Lovable site (D-131)

The public Journal at `/journal` is rendered by the Lovable site. Its content
comes from the WLA app, which is the only store of Journal content. This API
is **read-only, public and credential-free**: it returns only the published
(live), non-archived version of each article.

**Status:** implemented and tested in the WLA app (unit tests, plus the
database regression for what the underlying functions return). Not yet
verified against a running Supabase with the migration applied, and not yet
called from Lovable.

## Base URL and security

- Base: the WLA app's origin, e.g. `https://<wla-app-domain>` (locally
  `http://localhost:3000`). Configure it in Lovable as a plain, public
  setting such as `WLA_API_BASE`.
- **No key, token, cookie or secret is needed or accepted.** Do not put any
  Supabase key in Lovable for the Journal. Requests must be sent **without
  credentials** (`fetch(url)` — not `credentials: "include"`).
- CORS: `Access-Control-Allow-Origin: *`, methods `GET, OPTIONS`, no
  credentials.
- Caching: `Cache-Control: public, max-age=0, s-maxage=30, stale-while-revalidate=30`.
  A newly published, unpublished or edited article is reflected within about a
  minute at a CDN.
- Image URLs and in-body image URLs are **absolute** URLs on the WLA app
  (`/api/journal/media/<id>`), which redirect to a short-lived signed file
  URL. Use them as-is in `<img src>`; do not cache or rewrite them.

## Never returned

Drafts, unpublished or superseded versions, revision ids or numbers, content
hashes, review assignments or decisions, internal comments, change history,
audit data, staff ids or emails, scheduling data, import data. The responses
are rebuilt from an allowlist, so these cannot appear even by mistake.

## Endpoints

### `GET /api/journal/articles`

Published articles, newest first (by `publishedAt`).

| Query | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | integer ≥ 1 | 1 | |
| `pageSize` | integer 1–50 | 12 | |
| `category` | slug | — | from `/api/journal/categories` |
| `tag` | slug | — | from `/api/journal/tags` |
| `q` | text ≤ 200 | — | full-text search over title, excerpt, tags and body; results ranked by relevance |

```json
{
  "data": [
    {
      "slug": "less-authority",
      "title": "Less Authority",
      "excerpt": "What writing taught me about attention…",
      "author": { "name": "Within Lab Academy" },
      "category": { "slug": "essays", "name": "Essays" },
      "tags": [{ "slug": "reading-notes", "label": "reading notes" }],
      "featuredImage": { "url": "https://<wla>/api/journal/media/0b8f…", "alt": "A desk by the window" },
      "publishedAt": "2019-04-02T10:15:23Z",
      "updatedAt": "2026-10-14T09:00:00Z",
      "readingMinutes": 4
    }
  ],
  "pagination": { "page": 1, "pageSize": 12, "hasMore": true }
}
```

`author`, `category`, `featuredImage` and `excerpt` may be `null`. There is no
total count; use `hasMore` for "Earlier writing →".

### `GET /api/journal/articles/:slug`

```json
{
  "data": {
    "slug": "less-authority",
    "title": "Less Authority",
    "excerpt": "…",
    "author": { "name": "…" },
    "category": { "slug": "essays", "name": "Essays" },
    "tags": [{ "slug": "attention", "label": "attention" }],
    "featuredImage": { "url": "https://<wla>/api/journal/media/…", "alt": "…" },
    "publishedAt": "2019-04-02T10:15:23Z",
    "firstPublishedAt": "2026-10-01T09:00:00Z",
    "updatedAt": "2026-10-14T09:00:00Z",
    "readingMinutes": 6,
    "bodyHtml": "<p>…</p><h2>…</h2><figure><img src=\"https://<wla>/api/journal/media/…\" alt=\"…\" /></figure>",
    "seo": { "title": "…", "description": "…", "canonicalUrl": null },
    "originalSource": { "url": "https://medium.com/@wla/…", "site": "medium" }
  }
}
```

- `publishedAt` is the date to show: the original publication date for
  imported pieces, otherwise when it first went live on WLA. `updatedAt` is
  when the current version went live.
- `bodyHtml` is already sanitised to the Journal allowlist (`p h2 h3 h4
  blockquote ul ol li strong em u s code pre a figure figcaption img hr br`)
  and is safe to render as HTML. Style it; do not re-sanitise it with a
  stricter list (images and links would be lost).
- `seo.canonicalUrl`: when `null`, the canonical URL is Lovable's own
  `/journal/<slug>`. Use `seo.title` / `seo.description` for `<title>`,
  description and Open Graph tags.
- `originalSource` is non-null for posts migrated from Medium ("First
  published on Medium").

**Renamed article:** an old slug returns `200 { "movedTo": "<new-slug>" }`.
Lovable should navigate (replace) to `/journal/<new-slug>`; for SEO, a
server-side 301 is better where Lovable supports one.

### `GET /api/journal/categories`

```json
{ "data": [{ "slug": "essays", "name": "Essays", "description": "Longer founder-led writing…" }] }
```

In editorial order. A category may have no published articles yet.

### `GET /api/journal/tags`

```json
{ "data": [{ "slug": "reading-notes", "label": "reading notes" }] }
```

Only tags used by at least one published article.

## Errors

| Status | Body | When |
| --- | --- | --- |
| 400 | `{ "error": { "code": "invalid_parameter", "message": "…" } }` | bad `page`, `pageSize`, `category`, `tag` or over-long `q` |
| 404 | `{ "error": { "code": "not_found", "message": "No published article has that address." } }` | unknown slug **and** draft, unpublished, archived or scheduled-but-not-yet-live articles (indistinguishable on purpose) |
| 503 | `{ "error": { "code": "unavailable", "message": "The Journal is temporarily unavailable." } }` | the database could not be reached, or any other failure; retry later. Never cached. |

Messages are for logs; Lovable should show its own copy. Every error body has
this shape and carries the CORS headers; no database text, stack or internal
detail is ever returned. A 400 and a 503 are `no-store`; a 404 is cached like a
success (≈30 s), so a just-published article may 404 for that long at a CDN.

**Images** (`/api/journal/media/<id>`): `302` to a signed file URL valid for
5 minutes (`Cache-Control: private, max-age=60`), or an empty `404` for an id
that does not exist, an image no live article uses, or a signing failure — the
same answer in every case. The signed URL points at the WLA Supabase storage
host, so locally it only works on the machine running Supabase.

**Deployment:** set `NEXT_PUBLIC_SITE_URL` to the WLA app's public origin.
Without it, absolute image URLs are built from the request's own host.

## Integration sketch (Lovable)

```ts
const BASE = import.meta.env.VITE_WLA_API_BASE; // public, not a secret

export async function listArticles(page = 1, category?: string) {
  const u = new URL("/api/journal/articles", BASE);
  u.searchParams.set("page", String(page));
  if (category) u.searchParams.set("category", category);
  const res = await fetch(u); // no credentials
  if (!res.ok) throw new Error((await res.json()).error?.code ?? "unavailable");
  return res.json();
}

export async function getArticle(slug: string) {
  const res = await fetch(new URL(`/api/journal/articles/${encodeURIComponent(slug)}`, BASE));
  if (res.status === 404) return { notFound: true };
  if (!res.ok) throw new Error("unavailable");
  return res.json(); // { data } or { movedTo }
}
```

The full, tested Lovable implementation (files, prompt, configuration and
checklist) is in `docs/LOVABLE-JOURNAL-INTEGRATION.md`.
