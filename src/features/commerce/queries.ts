import "server-only";

import { requireParent } from "@/lib/permissions";
import type { MissionRow } from "@/types/database";

/**
 * Commerce reads. Like every other child-scoped access, these go through the
 * permissions layer rather than being queried from a route.
 */

/** A published, purchasable mission. Safe to call before sign-in decisions. */
export async function getPurchasableMission(
  slug: string,
): Promise<MissionRow | null> {
  const { supabase } = await requireParent();

  const { data } = await supabase
    .from("missions")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  return data ?? null;
}

/**
 * Which of this parent's children already hold a mission.
 *
 * RLS scopes `mission_entitlements` to the family, so this cannot see another
 * family's rows — and the ids returned are only ever the caller's own.
 */
export async function getEntitledChildIds(
  missionId: string,
): Promise<string[]> {
  const { supabase } = await requireParent();

  const { data } = await supabase
    .from("mission_entitlements")
    .select("child_id")
    .eq("mission_id", missionId)
    .eq("status", "active");

  return (data ?? []).map((row) => row.child_id);
}

/**
 * Published free missions.
 *
 * Which missions are free is a data question, answered by `is_free` on the
 * mission row — there is no hard-coded "the free mission" anywhere.
 */
export async function getFreeMissions(): Promise<MissionRow[]> {
  const { supabase } = await requireParent();

  const { data } = await supabase
    .from("missions")
    .select("*")
    .eq("published", true)
    .eq("is_free", true)
    .order("title", { ascending: true });

  return data ?? [];
}
