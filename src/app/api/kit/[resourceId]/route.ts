import { NextResponse, type NextRequest } from "next/server";
import { getChildSession, createChildClient } from "@/lib/child-session";
import { logWarn } from "@/lib/observability/logger";

/**
 * MISSION KIT FILES FOR A CHILD SESSION — D-64.
 *
 * THE SHAPE OF THE DECISION
 *
 *   authorise  → in the database, from the session token
 *   sign       → here, with a server credential
 *
 * Those are deliberately two different places. `child_session_resource_path`
 * is the ONLY thing that decides whether this child may have this file: it
 * derives the child from the token, checks the entitlement, checks that the
 * resource belongs to the version the child's run is pinned to, and checks
 * `can_view`. It returns a path or nothing. This handler cannot widen that —
 * it has no child id to pass and no way to ask for a different path.
 *
 * WHY A SERVER CREDENTIAL IS NEEDED AT ALL
 *   The bucket is private and its read policy keys on `auth.uid()`. A child
 *   session has no `auth.uid()`, and minting a signed URL is a separate HTTP
 *   request to the storage service that cannot carry the transaction-local
 *   actor the database uses. Every alternative considered — a public bucket,
 *   a policy that trusts a client-supplied id, a browser-side service key —
 *   would hand out files without authorisation. Signing server-side after a
 *   database decision is the smallest arrangement that does not.
 *
 * WHAT THIS DOES NOT DO
 *   It never accepts a child id, a mission id or a storage path from the
 *   request. The only input is a resource id, and an id the child may not have
 *   simply yields nothing.
 */

const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> },
) {
  const { resourceId } = await params;

  let session;
  try {
    session = await getChildSession();
  } catch {
    // Unreachable session service (D-98): retryable, and says nothing about the resource.
    return new NextResponse("Try again", { status: 503, headers: { "Retry-After": "5" } });
  }
  if (!session) {
    // No session: say nothing about whether the resource exists.
    return new NextResponse("Not found", { status: 404 });
  }

  const anon = createChildClient();
  const { data: path, error } = await anon.rpc("child_session_resource_path", {
    p_token: session.token,
    p_resource_id: resourceId,
  });

  if (error || !path) {
    // Not entitled, wrong version, not viewable, or no such resource — all one
    // answer, so this cannot be used to discover which resources exist.
    return new NextResponse("Not found", { status: 404 });
  }

  let signedUrl: string | null = null;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data, error: signError } = await admin.storage
      .from("mission-resources")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signError) throw signError;
    signedUrl = data?.signedUrl ?? null;
  } catch (e) {
    /*
     * The authorisation decision succeeded; only signing failed. That is a
     * configuration problem (a missing SUPABASE_SERVICE_ROLE_KEY) or a storage
     * outage, and it must not read as "you may not have this".
     */
    logWarn("child_kit_sign_failed", {
      resourceId,
      reason: e instanceof Error ? e.message : "unknown",
    });
    return new NextResponse(
      "This file can't be opened right now. Please ask a parent.",
      { status: 503 },
    );
  }

  if (!signedUrl) {
    return new NextResponse("This file is unavailable.", { status: 503 });
  }

  // 302, and never cached: the signed URL is short-lived and per-request.
  return NextResponse.redirect(signedUrl, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
