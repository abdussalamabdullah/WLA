import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/** Routes requiring an authenticated parent session. */
const PROTECTED_PREFIXES = ["/academy", "/account"];

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
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Return them to where they were headed after signing in.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/academy/my-missions";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
