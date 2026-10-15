import type { NextRequest } from "next/server";

import { apiOrigin, fail, isSlug, ok, preflight, unavailable } from "@/features/journal/http";
import { listPublicArticles } from "@/features/journal/public-api";

/**
 * GET /api/journal/articles — published, unarchived articles, newest first.
 * Query: page (≥1), pageSize (1–50, default 12), category, tag (slugs), q (search).
 * Contract: docs/JOURNAL-PUBLIC-API.md.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const page = Number(sp.get("page") ?? "1");
  const pageSize = Number(sp.get("pageSize") ?? "12");
  if (!Number.isInteger(page) || page < 1 || page > 1000) return fail(400, "invalid_parameter", "page must be a whole number from 1.");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return fail(400, "invalid_parameter", "pageSize must be a whole number from 1 to 50.");
  const category = sp.get("category");
  const tag = sp.get("tag");
  if (category !== null && !isSlug(category)) return fail(400, "invalid_parameter", "category must be a category slug.");
  if (tag !== null && !isSlug(tag)) return fail(400, "invalid_parameter", "tag must be a tag slug.");
  const q = sp.get("q");
  if (q !== null && q.length > 200) return fail(400, "invalid_parameter", "q must be 200 characters or fewer.");
  try {
    return ok(await listPublicArticles({ page, pageSize, category, tag, search: q?.trim() || null }, apiOrigin(request)));
  } catch (e) {
    return unavailable(e, "list");
  }
}

export const OPTIONS = preflight;
