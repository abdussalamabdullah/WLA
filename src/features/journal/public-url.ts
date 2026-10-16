/**
 * WHERE READERS FIND AN ARTICLE (D-131, D-137).
 *
 * The public Journal is the Lovable website, not this app: `/journal/<slug>`
 * here is only the old stub, so linking to it from the studio gave a 404.
 * Links to a published article therefore point at the public website, whose
 * origin is `NEXT_PUBLIC_JOURNAL_SITE_URL` (for example
 * https://withinlab.academy). Unset, there is no public link at all, and the
 * studio shows its own read-only view of the live version instead of a link
 * that cannot work.
 */
export function journalSiteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_JOURNAL_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function publicArticleUrl(slug: string | null | undefined): string | null {
  const origin = journalSiteOrigin();
  if (!origin || !slug) return null;
  return `${origin}/journal/${encodeURIComponent(slug)}`;
}
