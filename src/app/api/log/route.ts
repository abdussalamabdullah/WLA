import { NextResponse } from "next/server";
import { logError } from "@/lib/observability/logger";

/**
 * OPS-01 — the client-side half.
 *
 * A React error boundary runs in the browser, where `logError` cannot: the
 * logger is server-only by design, because it must never be bundled anywhere a
 * child could read it. This endpoint is the one narrow bridge.
 *
 * DELIBERATELY NOT A GENERAL LOGGING ENDPOINT. It accepts a boundary name and
 * a digest — the opaque id Next.js assigns to a server error — and nothing
 * else. It does not accept a message, a stack, a URL or arbitrary fields,
 * because an endpoint that writes caller-supplied text into the log is both a
 * way to forge log entries and a way to bury real ones under noise.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { boundary, digest } = (body ?? {}) as Record<string, unknown>;
  const safeBoundary =
    typeof boundary === "string" && /^[a-z-]{1,40}$/.test(boundary)
      ? boundary
      : "unknown";
  const safeDigest =
    typeof digest === "string" && /^[A-Za-z0-9]{1,64}$/.test(digest)
      ? digest
      : null;

  logError("client_boundary", new Error("client render failed"), {
    boundary: safeBoundary,
    digest: safeDigest,
  });

  return NextResponse.json({ ok: true });
}
