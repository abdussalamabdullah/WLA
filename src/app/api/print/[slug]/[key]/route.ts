import { NextResponse, type NextRequest } from "next/server";
import { resolveAcademyActor } from "@/features/academy/actor";
import { printFor } from "@/features/academy/play";
import { logWarn } from "@/lib/observability/logger";

/**
 * DYNAMIC PRINTABLES — `/api/print/<mission>/<print>` (Plan §5).
 *
 * The actor is the signed-in parent's active child (permission chain) or the
 * child's own session; no child, progress or file id is accepted. The PDF is
 * made per request from the run's pinned version and is never stored or
 * cached: it can carry this run's values.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string; key: string }> }) {
  const { slug, key } = await params;
  const actor = await resolveAcademyActor();
  if (actor.kind !== "parent" && actor.kind !== "child") return new NextResponse("Not found", { status: 404 });
  try {
    const out = await printFor(actor, slug, key);
    if (!out) return new NextResponse("Not found", { status: 404 });
    const name = out.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "print";
    return new NextResponse(Buffer.from(out.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logWarn("print_refused", { reason: error instanceof Error ? error.message.slice(0, 80) : "unknown" });
    return new NextResponse("Not found", { status: 404 });
  }
}
