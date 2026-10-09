/**
 * The one guard for a post-sign-in destination (`?next=`).
 *
 * Only a same-origin path is allowed; anything else falls back. Rejected:
 * absolute URLs, protocol-relative `//host`, and any backslash — browsers
 * read `/\host` as `//host`, so a check for `//` alone is an open redirect.
 * Control characters (a tab or newline inside `/\t/host`) are stripped by URL
 * parsers before resolution, so they are rejected too.
 *
 * Shared by sign-in, sign-up, the email callback, the middleware and child
 * creation, so the rule cannot drift between them.
 */
export const DEFAULT_NEXT = "/academy/my-missions";

export function safeNext(
  next: string | null | undefined,
  fallback: string = DEFAULT_NEXT,
): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}

/** `safeNext`, or null when there is no usable destination at all. */
export function safeNextOrNull(next: string | null | undefined): string | null {
  const safe = safeNext(next, "");
  return safe === "" ? null : safe;
}
