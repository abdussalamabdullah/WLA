import type { NextRequest } from "next/server";

import { apiOrigin, fail, isSlug, ok, preflight, unavailable } from "@/features/journal/http";
import { getPublicArticle } from "@/features/journal/public-api";

/**
 * GET /api/journal/articles/:slug — one published article.
 * 200 { data } · 200 { movedTo } for a renamed article · 404 not_found.
 * Contract: docs/JOURNAL-PUBLIC-API.md.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSlug(slug)) return fail(404, "not_found", "No published article has that address.");
  try {
    const result = await getPublicArticle(slug, apiOrigin(request));
    if (!result) return fail(404, "not_found", "No published article has that address.");
    if ("movedTo" in result) return ok({ movedTo: result.movedTo });
    return ok({ data: result.article });
  } catch (e) {
    return unavailable(e, "article");
  }
}

export const OPTIONS = preflight;
