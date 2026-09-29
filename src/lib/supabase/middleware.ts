import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { boundedFetch } from "./fetch";

/**
 * Routes requiring a PARENT session specifically. A child session is not
 * enough for any of these: family management, purchases and the admin surface
 * belong to the account holder.
 */
const PARENT_ONLY_PREFIXES = ["/account", "/admin", "/purchase"];

/**
 * Routes requiring SOME learner session — a parent with a child selected, or a
 * child with their own session (D-58). Which of the two it is gets resolved
 * properly in `resolveAcademyActor`; here we only need to know that an
 * entirely anonymous visitor should be sent somewhere sensible.
 */
const LEARNER_PREFIXES = ["/academy"];

/** The cookie a child session lives in. Presence is a HINT ONLY — it is
 *  verified against the database on every page and every RPC. */
const CHILD_COOKIE = "wla_child_session";

/** Auth screens a signed-in parent should not sit on. */
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];

/**
 * Session refresh + route protection.
 *
 * Tech Spec §25 is explicit that frontend route restrictions are NOT a
 * security control — RLS and `lib/permissions` are. This exists so a signed-out
 * visitor gets a sensible redirect instead of an error page, and so tokens are
 * refreshed before Server Components read them.
 *
 * It must never be the only thing standing between a request and child data.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      global: { fetch: boundedFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() revalidates against Supabase. Do not substitute getSession(),
  // which trusts the cookie without verifying it.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  /*
   * Unreachable auth is not "signed out". Redirecting here sent signed-in
   * parents to /login mid-mission whenever GoTrue timed out (staging QA,
   * heavy packet loss). This layer is not the security control, so when it
   * cannot tell, it does not guess: the page's own checks run, fail closed
   * with ServiceUnavailableError, and the error boundary offers a retry.
   */
  if (error && (error.status === undefined || error.status === 0 || error.status >= 500)) {
    return response;
  }

  const { pathname } = request.nextUrl;
  const matches = (list: string[]) =>
    list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  /*
   * A child holding a session must never be bounced to the PARENT sign-in
   * screen, and must never reach the parent-only surfaces. `/purchase` is in
   * that list because it previously fell through to no protection at all and
   * threw an unhandled AccessError for anonymous visitors.
   */
  const hasChildCookie = Boolean(request.cookies.get(CHILD_COOKIE)?.value);

  if (matches(PARENT_ONLY_PREFIXES) && !user) {
    const url = request.nextUrl.clone();
    // Send a child to their own Academy rather than to a form they cannot use.
    url.pathname = hasChildCookie ? "/academy/my-missions" : "/login";
    url.search = "";
    if (!hasChildCookie) url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (matches(LEARNER_PREFIXES) && !user && !hasChildCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // A signed-in child on the child sign-in screen is handled by the page
  // itself, which can verify the session properly rather than trust a cookie.
  if (user && AUTH_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/academy/my-missions";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
