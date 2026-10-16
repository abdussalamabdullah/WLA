import { htmlToText, mediaUrl, readingMinutes, sanitizeArticleHtml, tagLabel, wordCount } from "@/features/journal/content";

/**
 * ONE ARTICLE, as the studio previews it (D-131: the public Journal is the
 * Lovable site, fed by /api/journal — whose body goes through the same
 * sanitiser, so a preview cannot show markup readers would not get).
 *
 * The body is sanitised again here, at render, whatever was stored: the
 * allowlist in content.ts is the rendering contract, not just a save-time
 * filter (D-123).
 */
export type ArticleViewData = {
  title: string;
  excerpt: string | null;
  bodyHtml: string;
  authorName: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  tags: string[];
  featuredMediaId: string | null;
  featuredAlt: string | null;
  displayDate: string | null;
  updatedAt: string | null;
  sourceUrl: string | null;
};

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function formatJournalDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFormat.format(d);
}

/**
 * `mediaSrc` serves the images from somewhere other than the staff media
 * route — a private preview link uses its own, token-checked route (D-134).
 * It is applied AFTER sanitising, to image URLs the allowlist already kept.
 */
export function ArticleView({ article, mediaSrc }: { article: ArticleViewData; mediaSrc?: (mediaId: string) => string }) {
  const clean = sanitizeArticleHtml(article.bodyHtml);
  const body = mediaSrc
    ? clean.replace(/(<img[^>]*\ssrc=")\/api\/journal\/media\/([0-9a-f-]{36})"/g, (_m, pre: string, id: string) => `${pre}${mediaSrc(id)}"`)
    : clean;
  const minutes = readingMinutes(wordCount(htmlToText(body)));
  const published = formatJournalDate(article.displayDate);
  const updated = formatJournalDate(article.updatedAt);
  const fromMedium = article.sourceUrl && /(^|\.)medium\.com\//i.test(article.sourceUrl.replace(/^https?:\/\//, ""));

  return (
    <article className="wla-container-narrow pt-[var(--space-2xl)] pb-[var(--space-4xl)]">
      <header>
        {article.categoryName && (
          <p className="text-[length:var(--text-eyebrow)] uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-text-muted)]">
            {article.categoryName}
          </p>
        )}
        <h1 className="wla-display mt-[var(--space-s)]">{article.title}</h1>
        {article.excerpt && (
          <p className="mt-[var(--space-m)] wla-measure font-[family-name:var(--font-serif)] text-[length:var(--text-body-lg)] italic text-[var(--color-text-muted)]">
            {article.excerpt}
          </p>
        )}
        <p className="mt-[var(--space-m)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {[article.authorName && `By ${article.authorName}`, published, `${minutes} min read`].filter(Boolean).join(" · ")}
        </p>
        {updated && published && updated !== published && (
          <p className="mt-[var(--space-xs)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">Updated {updated}</p>
        )}
      </header>

      {article.featuredMediaId && (
        <figure className="mt-[var(--space-xl)]">
          {/* A plain img: the route answers with a short-lived signed redirect,
              which next/image would try to optimise and cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaSrc ? mediaSrc(article.featuredMediaId) : mediaUrl(article.featuredMediaId)}
            alt={article.featuredAlt ?? ""}
            className="block h-auto w-full rounded-[var(--radius-surface)]"
          />
        </figure>
      )}

      <div className="wla-article-body mt-[var(--space-xl)]" dangerouslySetInnerHTML={{ __html: body }} />

      {(article.tags.length > 0 || fromMedium) && (
        <footer className="mt-[var(--space-2xl)] border-t border-[var(--color-border)] pt-[var(--space-l)]">
          {article.tags.length > 0 && (
            <>
              <h2 className="sr-only">Tags</h2>
              <ul className="flex flex-wrap gap-[var(--space-s)]">
                {article.tags.map((t) => (
                  <li key={t}>
                    <span className="inline-flex min-h-[var(--target-min)] items-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-[var(--space-s)] text-[length:var(--text-small)]">{tagLabel(t)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {fromMedium && published && (
            <p className="mt-[var(--space-m)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">First published on Medium, {published}.</p>
          )}
        </footer>
      )}
    </article>
  );
}
