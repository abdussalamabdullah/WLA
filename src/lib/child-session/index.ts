import "server-only";

import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";
import { boundedFetch } from "@/lib/supabase/fetch";

/**
 * CHILD SESSIONS — D-58, D-59.
 *
 * The parent equivalent of this file is lib/supabase/server.ts plus
 * lib/permissions. This is deliberately its own, much smaller surface: a child
 * can do far less than a parent, and the narrowness is the point.
 *
 * THE TOKEN IS NOT AN IDENTIFIER. It is a 256-bit bearer secret whose only
 * meaning is inside the database — `verify_child_session` exchanges it for a
 * child id, checking expiry and revocation as it goes. Nothing in this process
 * decides who the child is; it only carries the token.
 *
 * Consequently there is no `childId` parameter anywhere in the child data path.
 * A forged child id has nothing to forge: the RPCs do not accept one.
 */

const COOKIE = "wla_child_session";

/** An unauthenticated client. The child's authority comes from the token it
 *  passes to the RPCs, never from a Supabase session. */
export function createChildClient() {
  return createSupabaseClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: boundedFetch },
    },
  );
}

export async function getChildToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function setChildSession(token: string, expiresAt: string) {
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearChildSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export type ChildSession = {
  token: string;
  childId: string;
  displayName: string;
  birthYear: number | null;
};

/**
 * Resolve the current child session, or null.
 *
 * Every call re-verifies in the database. There is no cached "who is this"
 * anywhere in the process, so revoking a code takes effect on the next request
 * rather than whenever a cache happens to expire.
 */
export async function getChildSession(): Promise<ChildSession | null> {
  const token = await getChildToken();
  if (!token) return null;

  const supabase = createChildClient();
  const { data, error } = await supabase.rpc("verify_child_session", {
    p_token: token,
  });
  // A failed lookup is NOT a signed-out child (D-98): surfacing it as one
  // dropped children out of a mission mid-step on a network blip. Fail so the
  // page can say "try again"; only a real "no such session" is null.
  if (error) throw new ChildSessionUnavailableError(error.message);
  if (!data || data.length === 0) return null;

  const row = data[0];
  return {
    token,
    childId: row.child_id,
    displayName: row.display_name,
    birthYear: row.birth_year,
  };
}

/** The session service could not be reached — retryable, not "signed out". */
export class ChildSessionUnavailableError extends Error {
  constructor(detail = "") {
    super(`Child session check failed${detail ? `: ${detail.slice(0, 60)}` : ""}`);
    this.name = "ChildSessionUnavailableError";
  }
}

export class ChildAccessError extends Error {
  constructor(message = "No child session.") {
    super(message);
    this.name = "ChildAccessError";
  }
}

/** The child equivalent of requireParent. Throws rather than returning null so
 *  a caller cannot forget the check. */
export async function requireChildSession(): Promise<ChildSession> {
  const session = await getChildSession();
  if (!session) throw new ChildAccessError();
  return session;
}
