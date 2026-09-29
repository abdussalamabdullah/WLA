import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseServerEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Service-role client — BYPASSES RLS.
 *
 * Tech Spec §47: never import this from client code. The `server-only` guard
 * above turns any such import into a build error.
 *
 * Legitimate uses are narrow:
 *   - the Stripe webhook creating an entitlement for a not-yet-signed-in user
 *   - granting a FREE mission, which has no session to act on either
 *   - gift redemption linking a gift record to a child profile
 *
 * It reads the SUPABASE env only. It used to read a combined schema, which
 * made a free mission grant impossible whenever Stripe was unconfigured.
 *
 * It must never be used to sidestep an access check that lib/permissions
 * should be making. If you reach for it inside a request handler serving a
 * logged-in parent, that is almost certainly the wrong tool.
 */
export function createAdminClient() {
  const env = supabaseServerEnv();
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
