import "server-only";

import { requireAdmin } from "@/lib/permissions";

/**
 * Admin reads for the LMS surfaces.
 *
 * Every one of these calls a `security definer` function that begins with
 * `is_admin()`. `requireAdmin()` here is the SECOND check, not the only one —
 * it exists so a non-admin gets a redirect rather than a database error, and
 * so this module cannot be imported into a non-admin route by accident.
 */

export async function adminOverview() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_overview");
  return data?.[0] ?? null;
}

export async function adminActivity(limit = 25) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_activity", { p_limit: limit });
  return data ?? [];
}

export async function adminParents(search?: string) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_parents", {
    p_search: search ?? null,
  });
  return data ?? [];
}

export async function adminChildren(search?: string) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_children", {
    p_search: search ?? null,
  });
  return data ?? [];
}

export async function adminOrders() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_orders", {});
  return data ?? [];
}

export async function adminAnalytics() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_analytics");
  return data ?? [];
}

export async function adminMissionVersions(missionId: string) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_mission_versions", {
    p_mission_id: missionId,
  });
  return data ?? [];
}

export async function adminDraftScreens(missionId: string, version: number) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_draft_screens", {
    p_mission_id: missionId,
    p_version: version,
  });
  if (error) return [];
  return data ?? [];
}

export async function validateVersion(missionId: string, version: number) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("validate_mission_version", {
    p_mission_id: missionId,
    p_version: version,
  });
  return data ?? [];
}

export async function adminDraftResources(missionId: string, version: number) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_draft_resources", {
    p_mission_id: missionId,
    p_version: version,
  });
  if (error) return [];
  return data ?? [];
}

export async function adminDraftParentNote(missionId: string, version: number) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_draft_parent_note", {
    p_mission_id: missionId,
    p_version: version,
  });
  if (error || !data || data.length === 0) return null;
  return data[0];
}

/**
 * Short-lived links so an author can open the draft files they uploaded.
 *
 * Signed with the ADMIN'S OWN SESSION: the bucket's `admins read mission
 * resource files` policy already grants this, so no service-role key is
 * involved and an admin who loses `is_admin` loses it too. Callers pass only
 * paths that came from `admin_draft_resources` / `admin_draft_parent_note`,
 * which refuse a published version (D-61) — this is not a way to sign
 * arbitrary paths. Families still cannot read draft files at all (D-68).
 */
export async function signDraftFiles(paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const { supabase } = await requireAdmin();
  const { data } = await supabase.storage
    .from("mission-resources")
    .createSignedUrls(unique, 60 * 30);
  return new Map(
    (data ?? [])
      .filter((s) => !s.error && s.path && s.signedUrl)
      .map((s) => [s.path as string, s.signedUrl]),
  );
}
