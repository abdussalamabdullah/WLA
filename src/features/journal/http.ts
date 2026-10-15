import "server-only";

import { NextResponse } from "next/server";

import { logError } from "@/lib/observability/logger";
import { JournalUnavailable } from "./public-api";

/**
 * Shared HTTP behaviour of the public Journal API (D-131): read-only GET,
 * open CORS WITHOUT credentials (the data is public and identical for every
 * caller, so no cookie is ever read or allowed), short shared caching so an
 * unpublished article disappears within about a minute, and errors as stable
 * codes — never database text.
 */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const CACHE = "public, max-age=0, s-maxage=30, stale-while-revalidate=30";

export function ok(body: unknown) {
  return NextResponse.json(body, { status: 200, headers: { ...CORS, "Cache-Control": CACHE } });
}

export type ErrorCode = "invalid_parameter" | "not_found" | "unavailable";

export function fail(status: 400 | 404 | 503, code: ErrorCode, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...CORS, "Cache-Control": status === 404 ? CACHE : "no-store" } },
  );
}

/**
 * Any failure while answering: the documented 503, never Next's default error
 * page, a stack or database text. A database refusal was already logged where
 * it happened; anything else is unexpected and logged here.
 */
export function unavailable(error: unknown, op: string) {
  if (!(error instanceof JournalUnavailable)) logError("journal_public_api_failed", error, { op });
  return fail(503, "unavailable", "The Journal is temporarily unavailable.");
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** The origin the API's absolute URLs (images) point at. */
export function apiOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isSlug = (s: string | null): s is string => !!s && s.length <= 120 && SLUG.test(s);
