import { NextResponse, type NextRequest } from "next/server";

import { getPreviewMediaPath, PreviewUnavailable } from "@/features/journal/preview";
import { createAdminClient } from "@/lib/supabase/admin";
import { logWarn } from "@/lib/observability/logger";

/**
 * AN IMAGE IN A PRIVATE PREVIEW (D-134) — the D-64 shape:
 *
 *   authorise → in the database, from the link's token only
 *               (journal_preview_media_path: a valid, unrevoked, unexpired
 *               link; the image belongs to that article; the previewed
 *               version uses it)
 *   sign      → here, with the server credential, for five minutes
 *
 * The visitor has no Supabase identity, and the bucket's read policy keys on
 * one, so signing needs the server. This handler cannot widen the decision:
 * it takes only a token and a media id and never a path, and anything the
 * database does not return is a plain 404 — the same answer as an image that
 * does not exist.
 */
const NO_STORE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  let path: string | null;
  try {
    path = await getPreviewMediaPath(token, id);
  } catch (e) {
    if (e instanceof PreviewUnavailable) return new NextResponse(null, { status: 503, headers: { ...NO_STORE, "Retry-After": "5" } });
    throw e;
  }
  if (!path) return new NextResponse(null, { status: 404, headers: NO_STORE });

  const { data, error } = await createAdminClient().storage.from("journal-media").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    logWarn("journal_preview_sign_failed", { reason: error?.message ?? "no url" });
    return new NextResponse(null, { status: 404, headers: NO_STORE });
  }
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: NO_STORE });
}
