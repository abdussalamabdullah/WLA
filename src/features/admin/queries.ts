import "server-only";

import { requireAdmin } from "@/lib/permissions";
import type { MissionRow } from "@/types/database";

/**
 * Admin reads. Every one begins with `requireAdmin`, and the RLS policy added
 * by the editable-content migration is the independent second check.
 */

export type MissionStats = {
  mission_id: string;
  slug: string;
  title: string;
  version: number;
  published: boolean;
  price_minor: number | null;
  currency: string;
  is_free: boolean;
  entitlements: number;
  starts: number;
  completions: number;
  in_progress: number;
  dropped_off: number;
};

/**
 * The catalogue, with the ANALYTICS-01 figures beside each mission.
 *
 * The counts come from a security-definer function because an admin is not a
 * member of any family, so RLS on mission_progress would otherwise show them
 * nothing. That function refuses unless `is_admin()`, so being definer grants
 * an ordinary parent nothing.
 */
export async function listMissionsWithStats(): Promise<MissionStats[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_mission_stats", {
    p_stale_days: 14,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as MissionStats[];
}

/** One mission's editable record. */
export async function getMissionForEdit(
  slug: string,
): Promise<MissionRow | null> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("missions")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data ?? null;
}

/**
 * How many runs are currently pinned to each version of this mission.
 *
 * Shown in the editor so the consequence of a content change is visible before
 * it is made: D-17 keeps those runs on the version they started, and an editor
 * should be able to see that there ARE such runs.
 */
export async function getVersionUsage(
  missionId: string,
): Promise<{ version: number; runs: number; complete: number }[]> {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_mission_version_usage", {
    p_mission_id: missionId,
  });
  return (data ?? []) as { version: number; runs: number; complete: number }[];
}
