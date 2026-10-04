import { NextResponse, type NextRequest } from "next/server";
import { resolveAcademyActor } from "@/features/academy/actor";
import { scanQrFor } from "@/features/academy/play";
import { logWarn } from "@/lib/observability/logger";
import { kitAnchor } from "@/components/mission/resource-item";

/**
 * KIT QR CODES — `/q/<mission>/<code>` (Enhancement Plan §5).
 *
 * Printed on Mission Kit pages. Mission-aware (the path names the mission)
 * and state-aware (the code's condition is evaluated against the run). The
 * request carries no child id and no progress id: the actor is the signed-in
 * parent's ACTIVE child through the permission chain, or the child's own
 * access-code session — exactly as for playing the mission. A child who is
 * not entitled, or a code that does not exist, gets the same answer as
 * anywhere else: nothing about the mission is revealed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string; key: string }> }) {
  const { slug, key } = await params;
  const here = `/q/${encodeURIComponent(slug)}/${encodeURIComponent(key)}`;
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);

  const actor = await resolveAcademyActor();
  if (actor.kind === "anonymous") return go(`/login?next=${encodeURIComponent(here)}`);
  if (actor.kind === "parent_needs_child" || actor.kind === "parent_no_children") return go("/academy/my-missions");

  try {
    const d = await scanQrFor(actor, slug, key);
    const base = `/academy/missions/${encodeURIComponent(slug)}`;
    // The exact resource: the Kit page, scrolled to it.
    if (d.to === "kit") return go(`${base}/kit${d.resource ? `#${kitAnchor(d.resource)}` : ""}`);
    if (d.to === "active") return go(`${base}/active`);
    return go(base);
  } catch (error) {
    // Not entitled, no such mission: the same quiet answer.
    logWarn("qr_scan_refused", { reason: error instanceof Error ? error.message.slice(0, 80) : "unknown" });
    return go("/academy/my-missions");
  }
}
