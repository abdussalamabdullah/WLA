import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * /api/journal/media/<id> — the only way an article image is served (D-127).
 *
 * Resolved and signed with the VISITOR'S OWN session, never the service role:
 * journal_media_path returns a path only for an image the live revision uses
 * (or for staff who can see the article), and the storage policy checks the
 * same thing again before it will sign. Anything else is a plain 404, the
 * same answer as for an id that does not exist.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const { data: path } = await supabase.rpc("journal_media_path", { p_id: id });
  if (!path) return new NextResponse(null, { status: 404 });

  const { data } = await supabase.storage.from("journal-media").createSignedUrl(path, 300);
  if (!data?.signedUrl) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    // Short and private: an image can stop being public (unpublish, archive).
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
