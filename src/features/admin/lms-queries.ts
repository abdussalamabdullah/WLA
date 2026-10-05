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

/**
 * AUTOMATED MISSION QA for a draft (validator.ts, Part 6).
 *
 * Loads the canonical model through the draft-only RPCs — screens, the
 * definition (D-61: refuses a published version), the version's completion
 * rule — runs the TypeScript validator, and adds the database's Kit and
 * parent-note checks, which only SQL can answer. Used by the builder page
 * (while authoring) and by the status action (before review and publish).
 */
export async function draftQaReport(missionId: string, version: number) {
  const { buildModel } = await import("@/features/mission-engine/definition");
  const { validateMission } = await import("@/features/mission-engine/validator");
  const { supabase } = await requireAdmin();
  const [screens, defRes, verRes, sqlIssues, resources, missionRes, media] = await Promise.all([
    adminDraftScreens(missionId, version),
    supabase.rpc("admin_draft_definition", { p_mission_id: missionId, p_version: version }),
    supabase.from("mission_versions").select("completion_rule").eq("mission_id", missionId).eq("version", version).maybeSingle(),
    validateVersion(missionId, version),
    adminDraftResources(missionId, version),
    supabase.from("missions").select("min_age, max_age").eq("id", missionId).maybeSingle(),
    adminDraftAssets(missionId, version),
  ]);
  const model = buildModel({
    definition: defRes.data ?? {},
    screens: screens.map((s) => ({
      screenKey: s.screen_key, type: s.type, title: s.title, body: s.body,
      sequence: s.sequence, configuration: s.configuration,
    })),
    completionRule: verRes.data?.completion_rule ?? null,
  });
  const { issues, paths } = validateMission(model, {
    kitTitles: resources.map((r) => r.title),
    assets: media.rows.map((a) => ({ key: a.key, kind: a.kind, alt_text: a.alt_text, transcript: a.transcript, captions: Boolean(a.captions_path) })),
    ages: missionRes.data ? { min: missionRes.data.min_age, max: missionRes.data.max_age } : null,
  });
  // The SQL gate's Kit / note findings are not visible to the TS validator.
  const fromSql = sqlIssues
    .filter((p) => ["no_kit_resources", "kit_resource_without_file", "no_parent_note"].includes(p.code))
    .map((p) => ({
      code: p.code,
      severity: (p.blocking ? "blocking" : "advisory") as "blocking" | "advisory",
      category: "assets" as const,
      screenKey: p.screen_key,
      detail: p.detail,
    }));
  // Print-output QA: render every printable for every variant (D-101).
  const { printQa } = await import("./print-qa");
  const fromPrints = await printQa(model, resources, media.rows);
  return { model, issues: [...issues, ...fromSql, ...fromPrints], paths, media };
}

/**
 * F7 — a draft version's media, with short-lived URLs signed by the ADMIN'S
 * OWN SESSION (`admins read mission media`). `admin_draft_assets` refuses a
 * published version (D-61), so this is not a read path to released media.
 */
export async function adminDraftAssets(missionId: string, version: number) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_draft_assets", { p_mission_id: missionId, p_version: version });
  const rows = (data ?? []) as import("@/types/database").MissionAssetRow[];
  const paths = [...new Set(rows.flatMap((a) => [a.storage_path, a.captions_path].filter((p): p is string => Boolean(p))))];
  const signed = paths.length
    ? (await supabase.storage.from("mission-media").createSignedUrls(paths, 60 * 30)).data ?? []
    : [];
  const url = new Map(signed.filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl]));
  const resolved: import("@/features/mission-engine/media").ResolvedAsset[] = rows.map((a) => ({
    key: a.key,
    kind: a.kind,
    url: url.get(a.storage_path) ?? "",
    alt: a.alt_text,
    longDescription: a.long_description,
    transcript: a.transcript,
    captionsUrl: a.captions_path ? (url.get(a.captions_path) ?? null) : null,
  }));
  return { rows, resolved };
}
