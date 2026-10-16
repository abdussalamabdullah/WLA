import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleView } from "@/components/journal/article-view";
import { getPreview, PreviewUnavailable, previewMediaUrl } from "@/features/journal/preview";

/**
 * A PRIVATE PREVIEW (D-134): the latest saved version of one article, for
 * someone without a WLA account. Never indexed, never sent as a referrer,
 * never cached. The public Journal (Lovable, via /api/journal) cannot see it.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function JournalPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let r;
  try {
    r = await getPreview(token);
  } catch (e) {
    if (e instanceof PreviewUnavailable) {
      return (
        <main className="wla-container py-[var(--space-4xl)]">
          <h1 className="text-[length:var(--text-h1)]">This preview isn&rsquo;t available right now</h1>
          <p className="mt-[var(--space-m)] wla-measure">Please try again in a moment.</p>
        </main>
      );
    }
    throw e;
  }
  if (!r) notFound();

  return (
    <main className="wla-band-raised">
      <div role="note" className="border-b border-[var(--color-border-strong)] bg-[var(--color-surface-sage)]">
        <p className="wla-container py-[var(--space-s)] text-[length:var(--text-small)]">
          <strong>Preview — {r.is_live ? "this is the published version" : "not published"}.</strong>{" "}
          This private link shows the latest saved draft. Only people with the link can see it, and they can&rsquo;t edit it.
        </p>
      </div>
      <ArticleView
        mediaSrc={(id) => previewMediaUrl(token, id)}
        article={{
          title: r.title || "Untitled",
          excerpt: r.excerpt,
          bodyHtml: r.body_html,
          authorName: r.author_name,
          categoryName: r.category_name,
          categorySlug: null,
          tags: r.tags,
          featuredMediaId: r.featured_media_id,
          featuredAlt: r.featured_alt,
          displayDate: r.original_published_at ?? r.first_published_at ?? r.saved_at,
          updatedAt: null,
          sourceUrl: r.source_url,
        }}
      />
    </main>
  );
}
