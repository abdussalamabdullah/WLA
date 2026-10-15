import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { boundedFetch } from "@/lib/supabase/fetch";
import { logWarn } from "@/lib/observability/logger";
import type { Database, JournalPublicArticleRow, JournalPublicListRow } from "@/types/database";
import { htmlToText, mediaUrl, readingMinutes, sanitizeArticleHtml, tagLabel, wordCount } from "./content";

/**
 * THE PUBLIC JOURNAL API (D-131) — what the Lovable site reads.
 *
 * Reads ONLY through journal_public_* (live revisions of unarchived articles)
 * with an ANONYMOUS, cookie-less client: the response is the same for every
 * caller, a signed-in staff member included, so nothing private can leak into
 * a cached public response. The anon key is the public one already shipped to
 * every browser; no secret is used or exposed.
 *
 * Every response is rebuilt field by field from an allowlist — no revision
 * ids, hashes, staff ids, comments or review data exist in these shapes — and
 * the body is sanitised again with image URLs made absolute, so Lovable can
 * render it directly.
 */
function anon() {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: boundedFetch },
  });
}

export class JournalUnavailable extends Error {}

export type PublicImage = { url: string; alt: string };
export type PublicArticleSummary = {
  slug: string;
  title: string;
  excerpt: string | null;
  author: { name: string } | null;
  category: { slug: string; name: string } | null;
  tags: { slug: string; label: string }[];
  featuredImage: PublicImage | null;
  publishedAt: string | null;
  updatedAt: string | null;
  readingMinutes: number;
};
export type PublicArticle = PublicArticleSummary & {
  bodyHtml: string;
  firstPublishedAt: string | null;
  seo: { title: string; description: string | null; canonicalUrl: string | null };
  originalSource: { url: string; site: "medium" | "other" } | null;
};

const abs = (origin: string, path: string) => `${origin}${path}`;

function image(origin: string, id: string | null, alt: string | null): PublicImage | null {
  return id ? { url: abs(origin, mediaUrl(id)), alt: alt ?? "" } : null;
}

const tags = (t: string[] | null) => (t ?? []).map((slug) => ({ slug, label: tagLabel(slug) }));

/** Sanitised body with WLA media made absolute, so it renders on another domain. */
export function publicBody(html: string, origin: string): string {
  return sanitizeArticleHtml(html).replace(/(<img[^>]*\ssrc=")(\/api\/journal\/media\/)/g, `$1${origin}$2`);
}

function summary(r: JournalPublicListRow, origin: string): PublicArticleSummary {
  return {
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    author: r.author_name ? { name: r.author_name } : null,
    category: r.category_slug && r.category_name ? { slug: r.category_slug, name: r.category_name } : null,
    tags: tags(r.tags),
    featuredImage: image(origin, r.featured_media_id, r.featured_alt),
    publishedAt: r.display_date,
    updatedAt: r.updated_at,
    readingMinutes: readingMinutes(r.word_count),
  };
}

export async function listPublicArticles(
  q: { page: number; pageSize: number; category?: string | null; tag?: string | null; search?: string | null },
  origin: string,
): Promise<{ data: PublicArticleSummary[]; pagination: { page: number; pageSize: number; hasMore: boolean } }> {
  const { data, error } = await anon().rpc("journal_public_list", {
    p_category: q.category ?? null,
    p_tag: q.tag ?? null,
    p_query: q.search ?? null,
    p_limit: q.pageSize + 1,
    p_offset: (q.page - 1) * q.pageSize,
  });
  if (error) {
    logWarn("journal_public_api_failed", { op: "list", reason: error.message });
    throw new JournalUnavailable();
  }
  const rows = (data ?? []) as JournalPublicListRow[];
  return {
    data: rows.slice(0, q.pageSize).map((r) => summary(r, origin)),
    pagination: { page: q.page, pageSize: q.pageSize, hasMore: rows.length > q.pageSize },
  };
}

export async function getPublicArticle(slug: string, origin: string): Promise<{ article: PublicArticle } | { movedTo: string } | null> {
  const { data, error } = await anon().rpc("journal_public_article", { p_slug: slug });
  if (error) {
    logWarn("journal_public_api_failed", { op: "article", reason: error.message });
    throw new JournalUnavailable();
  }
  const r = ((data ?? []) as JournalPublicArticleRow[])[0];
  if (!r) return null;
  if (r.redirect_to) return { movedTo: r.redirect_to };
  if (!r.slug || !r.title) return null;
  const body = publicBody(r.body_html ?? "", origin);
  return {
    article: {
      slug: r.slug,
      title: r.title,
      excerpt: r.excerpt,
      author: r.author_name ? { name: r.author_name } : null,
      category: r.category_slug && r.category_name ? { slug: r.category_slug, name: r.category_name } : null,
      tags: tags(r.tags),
      featuredImage: image(origin, r.featured_media_id, r.featured_alt),
      publishedAt: r.display_date,
      firstPublishedAt: r.first_published_at,
      updatedAt: r.updated_at,
      readingMinutes: readingMinutes(wordCount(htmlToText(body))),
      bodyHtml: body,
      seo: { title: r.seo_title ?? r.title, description: r.seo_description ?? r.excerpt, canonicalUrl: r.canonical_url },
      originalSource: r.source_url ? { url: r.source_url, site: /(^|\.)medium\.com$/i.test(hostOf(r.source_url)) ? "medium" : "other" } : null,
    },
  };
}

export async function listPublicCategories(): Promise<{ slug: string; name: string; description: string | null }[]> {
  const { data, error } = await anon().from("journal_categories").select("slug, name, description, sort_order").order("sort_order").order("name");
  if (error) {
    logWarn("journal_public_api_failed", { op: "categories", reason: error.message });
    throw new JournalUnavailable();
  }
  return (data ?? []).map((c) => ({ slug: c.slug, name: c.name, description: c.description }));
}

export async function listPublicTags(): Promise<{ slug: string; label: string }[]> {
  const { data, error } = await anon().rpc("journal_public_tags", {});
  if (error) {
    logWarn("journal_public_api_failed", { op: "tags", reason: error.message });
    throw new JournalUnavailable();
  }
  return ((data ?? []) as { tag: string }[]).map((t) => ({ slug: t.tag, label: tagLabel(t.tag) }));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
