import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleView } from "@/components/journal/article-view";
import { getCategories, getStudioArticle } from "@/features/journal/queries";
import { REVISION_LABEL } from "@/features/journal/status";

export const metadata = { title: "Preview · Journal studio", robots: { index: false, follow: false } };

/**
 * PREVIEW of any version, rendered with the same component as the public
 * page. Staff only (the layout, and RLS on every row read here); never
 * cached publicly, never indexed.
 */
export default async function PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ revision?: string }> }) {
  const { id } = await params;
  const { revision } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [data, categories] = await Promise.all([getStudioArticle(id), getCategories()]);
  if (!data) notFound();
  const r = data.revisions.find((x) => x.id === revision) ?? data.working;
  if (!r) notFound();
  const category = categories.find((c) => c.id === r.category_id);
  const isLive = data.article.live_revision_id === r.id;

  return (
    <main className="wla-band-raised">
      <div role="note" className="border-b border-[var(--color-border-strong)] bg-[var(--color-surface-sage)]">
        <div className="wla-container flex flex-wrap items-center justify-between gap-[var(--space-m)] py-[var(--space-s)]">
          <p className="text-[length:var(--text-small)]">
            <strong>Preview of version {r.number}</strong> · {REVISION_LABEL[r.state]} ·{" "}
            {isLive ? "This is the version readers see." : "Readers can't see this version."}
          </p>
          <Link href={`/editorial/articles/${id}`} className="inline-flex min-h-[var(--target-min)] items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
            Back to the studio
          </Link>
        </div>
      </div>
      <ArticleView
        article={{
          title: r.title || "Untitled",
          excerpt: r.excerpt,
          bodyHtml: r.body_html,
          authorName: r.author_name,
          categoryName: category?.name ?? null,
          categorySlug: category?.slug ?? null,
          tags: r.tags,
          featuredMediaId: r.featured_media_id,
          featuredAlt: r.featured_alt,
          displayDate: r.original_published_at ?? data.article.first_published_at ?? r.updated_at,
          updatedAt: null,
          sourceUrl: r.source_url,
        }}
      />
    </main>
  );
}
