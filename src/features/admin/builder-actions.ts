"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/permissions";
import { screenConfigByType } from "@/features/mission-engine/schemas";
import { completionRule } from "@/features/mission-engine/schemas";
import { logWarn } from "@/lib/observability/logger";
import type { Json, ScreenTypeDb, WlaLab } from "@/types/database";

/**
 * MISSION BUILDER ACTIONS — D-56.
 *
 * THE RULE THAT KEEPS THIS FROM BECOMING A SECOND MISSION ENGINE:
 *
 * every screen's configuration is parsed with `screenConfigByType[type]` —
 * the SAME zod schemas the runtime engine parses with. The builder therefore
 * cannot author a screen the engine would refuse to render, and adding a new
 * kind of interaction still means a registry entry plus a schema, which is a
 * product decision (Tech Spec §62), not something an author can improvise.
 *
 * Nothing here writes mission_screens directly. Every write goes through a
 * `security definer` function that re-checks is_admin() and draft status.
 */

export type BuilderState = { error?: string; ok?: boolean; fieldErrors?: Record<string, string> };

const LABS: WlaLab[] = ["challenge", "decision", "curiosity", "wellbeing", "navigation"];

const newMissionSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lower-case words separated by hyphens."),
  title: z.string().trim().min(1, "Give the mission a title."),
  lab: z.enum(LABS as [WlaLab, ...WlaLab[]]),
  min_age: z.coerce.number().int().min(3).max(18),
  max_age: z.coerce.number().int().min(3).max(18),
}).refine((v) => v.min_age <= v.max_age, {
  message: "The youngest age cannot be above the oldest.",
  path: ["min_age"],
});

export async function createMissionAction(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const parsed = newMissionSchema.safeParse({
    slug: formData.get("slug"),
    title: formData.get("title"),
    lab: formData.get("lab"),
    min_age: formData.get("min_age"),
    max_age: formData.get("max_age"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "form");
      fieldErrors[k] ??= i.message;
    }
    return { fieldErrors };
  }

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("create_mission", {
    p_slug: parsed.data.slug,
    p_title: parsed.data.title,
    p_lab: parsed.data.lab,
    p_min_age: parsed.data.min_age,
    p_max_age: parsed.data.max_age,
  });

  if (error) {
    if (error.message.includes("slug_taken")) {
      return { fieldErrors: { slug: "A mission already uses that address." } };
    }
    logWarn("create_mission_failed", { reason: error.message });
    return { error: "We couldn't create that mission." };
  }

  const mission = data as unknown as { slug: string };
  revalidatePath("/admin/missions");
  redirect(`/admin/builder/${mission.slug}/1`);
}

export async function createVersionAction(_prev: BuilderState, formData: FormData): Promise<BuilderState> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");

  // Rollback (§12): a new draft copied from an earlier version — published or
  // archived — rather than the current one. Nothing earlier is reopened.
  const fromRaw = String(formData.get("fromVersion") ?? "");
  const fromVersion = /^\d+$/.test(fromRaw) ? Number(fromRaw) : null;

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("create_mission_version", {
    p_mission_id: missionId,
    ...(fromVersion ? { p_from_version: fromVersion } : {}),
  });
  if (error || !data) {
    logWarn("create_version_failed", { missionId, reason: error?.message });
    return { error: "We couldn't start a new version." };
  }
  const row = data as unknown as { version: number };
  revalidatePath(`/admin/missions/${slug}`);
  redirect(`/admin/builder/${slug}/${row.version}`);
}

/** Save one screen. Configuration is validated against the engine's schema. */
export async function saveScreenAction(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const screenKey = String(formData.get("screen_key") ?? "").trim();
  const type = String(formData.get("type") ?? "") as ScreenTypeDb;
  const title = String(formData.get("title") ?? "");
  const body = String(formData.get("body") ?? "");
  const sequence = Number(formData.get("sequence") ?? 0);
  const rawConfig = String(formData.get("configuration") ?? "{}");

  if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(screenKey)) {
    return { fieldErrors: { screen_key: "Use lower-case words separated by underscores." } };
  }

  let configuration: unknown;
  try {
    configuration = rawConfig.trim() === "" ? {} : JSON.parse(rawConfig);
  } catch {
    return { fieldErrors: { configuration: "This isn't valid JSON." } };
  }

  const schema = screenConfigByType[type as keyof typeof screenConfigByType];
  if (!schema) {
    return { fieldErrors: { type: "That isn't a screen type the Academy can render." } };
  }

  const parsed = schema.safeParse(configuration);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      fieldErrors: {
        configuration: `${first.path.join(".") || "configuration"}: ${first.message}`,
      },
    };
  }

  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_upsert_screen", {
    p_mission_id: missionId,
    p_version: version,
    p_screen_key: screenKey,
    p_type: type,
    p_title: title || null,
    p_body: body || null,
    p_sequence: sequence,
    p_configuration: configuration as Json,
  });

  if (error) {
    if (error.message.includes("version_not_editable")) {
      return { error: "This version is published and cannot be changed. Create a new version." };
    }
    logWarn("save_screen_failed", { missionId, reason: error.message });
    return { error: "We couldn't save that screen." };
  }

  revalidatePath(`/admin/builder/${slug}/${version}`);
  return { ok: true };
}

export async function deleteScreenAction(_prev: BuilderState, formData: FormData): Promise<BuilderState> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const screenKey = String(formData.get("screen_key") ?? "");

  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_delete_screen", {
    p_mission_id: missionId, p_version: version, p_screen_key: screenKey,
  });
  if (error) return { error: "We couldn't remove that screen." };
  revalidatePath(`/admin/builder/${slug}/${version}`);
  return { ok: true };
}

export async function moveScreenAction(formData: FormData): Promise<void> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const screenKey = String(formData.get("screen_key") ?? "");
  const direction = String(formData.get("direction") ?? "up") as "up" | "down";

  const { supabase } = await requireAdmin();
  await supabase.rpc("admin_move_screen", {
    p_mission_id: missionId, p_version: version,
    p_screen_key: screenKey, p_direction: direction,
  });
  revalidatePath(`/admin/builder/${slug}/${version}`);
}

export async function setCompletionRuleAction(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const raw = String(formData.get("rule") ?? "");

  let rule: unknown;
  try {
    rule = JSON.parse(raw);
  } catch {
    return { fieldErrors: { rule: "This isn't valid JSON." } };
  }

  // Same schema the engine evaluates completion with.
  const parsed = completionRule.safeParse(rule);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { fieldErrors: { rule: `${first.path.join(".") || "rule"}: ${first.message}` } };
  }

  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_set_completion_rule", {
    p_mission_id: missionId, p_version: version, p_rule: rule as Json,
  });
  if (error) {
    if (error.message.includes("version_not_editable")) {
      return { error: "This version is published and cannot be changed." };
    }
    return { error: "We couldn't save the completion rule." };
  }
  revalidatePath(`/admin/builder/${slug}/${version}`);
  return { ok: true };
}

export async function setVersionStatusAction(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const status = String(formData.get("status") ?? "") as
    "draft" | "in_review" | "published" | "archived";

  const { supabase } = await requireAdmin();

  // Automated mission QA runs BEFORE review and BEFORE publish (Part 6). The
  // database runs its own structural gate inside the RPC as a second line.
  if (status === "in_review" || status === "published") {
    const { draftQaReport } = await import("./lms-queries");
    const { issues } = await draftQaReport(missionId, version);
    const blockingCount = issues.filter((i) => i.severity === "blocking").length;
    if (blockingCount > 0) {
      return {
        error: `Mission QA found ${blockingCount} problem${blockingCount === 1 ? "" : "s"} that must be fixed first. They are listed under Review.`,
      };
    }
  }

  const { error } = await supabase.rpc("set_mission_version_status", {
    p_mission_id: missionId, p_version: version, p_status: status,
  });

  if (error) {
    if (error.message.includes("validation_failed")) {
      return { error: "This version still has problems that would stop a learner finishing it. Fix them below, then publish." };
    }
    if (error.message.includes("illegal_transition")) {
      return { error: "That isn't a change this version can make." };
    }
    logWarn("set_version_status_failed", { missionId, reason: error.message });
    return { error: "We couldn't change the status." };
  }

  revalidatePath(`/admin/builder/${slug}/${version}`);
  revalidatePath(`/admin/missions/${slug}`);
  revalidatePath("/admin/missions");
  return { ok: true };
}

export async function deleteMissionAction(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const missionId = String(formData.get("missionId") ?? "");

  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("delete_mission_if_unused", {
    p_mission_id: missionId,
  });

  if (error) {
    if (error.message.includes("mission_has_learner_records")) {
      return {
        error:
          "This mission has learner records, so it can't be deleted. Archive it instead — it disappears for new learners and every existing record stays.",
      };
    }
    return { error: "We couldn't delete that mission." };
  }

  revalidatePath("/admin/missions");
  redirect("/admin/missions");
}

/**
 * Save the mission definition (F8): variables, unlocks, events, variants,
 * pools, checkpoints, completion, stages. Parsed against the same schema the
 * runtime uses, then written through the draft-only RPC, which refuses a
 * published version (immutability, D-57/D-61).
 */
export async function saveDefinitionAction(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("definition") ?? "{}"));
  } catch {
    return { fieldErrors: { definition: "This isn't valid JSON." } };
  }
  const { missionDefinition } = await import("@/features/mission-engine/definition");
  const parsed = missionDefinition.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { fieldErrors: { definition: `${first.path.join(".") || "definition"}: ${first.message}` } };
  }
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_set_definition", {
    p_mission_id: missionId,
    p_version: version,
    p_definition: parsed.data as unknown as Json,
  });
  if (error) {
    if (error.message.includes("version_not_editable")) {
      return { error: "This version is published and can't be changed. Create a new version." };
    }
    logWarn("save_definition_failed", { missionId, reason: error.message });
    return { error: "We couldn't save the mission logic." };
  }
  revalidatePath(`/admin/builder/${slug}/${version}`);
  return { ok: true };
}


/**
 * Duplicate a mission (§12). The database copies the content (an admin has no
 * read path to published content, D-61); this copies the Kit files into the
 * new mission's folder with the admin's own storage permission, because the
 * family read policy keys on that folder (D-68). Learner records are never
 * copied. The new mission is unpublished, at v1 draft.
 */
export async function duplicateMissionAction(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const sourceId = String(formData.get("missionId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!title) return { fieldErrors: { title: "Give the copy a name." } };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return { fieldErrors: { slug: "Lower case letters, numbers and single hyphens." } };
  }
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_duplicate_mission", {
    p_source_id: sourceId,
    p_slug: slug,
    p_title: title,
  });
  if (error || !data) {
    if (error?.message.includes("slug_taken")) return { fieldErrors: { slug: "That address is already taken." } };
    logWarn("duplicate_mission_failed", { sourceId, reason: error?.message });
    return { error: "We couldn't duplicate this mission." };
  }
  const result = data as unknown as { slug: string; files: { bucket?: string; from: string; to: string }[] };
  const failed: string[] = [];
  for (const f of result.files) {
    // Kit files and notes in mission-resources; media (0032) in mission-media.
    const bucket = f.bucket === "mission-media" ? "mission-media" : "mission-resources";
    const { error: copyError } = await supabase.storage.from(bucket).copy(f.from, f.to);
    if (copyError) failed.push(f.from);
  }
  if (failed.length) {
    logWarn("duplicate_mission_files_failed", { sourceId, count: failed.length });
  }
  revalidatePath("/admin/missions");
  redirect(`/admin/builder/${result.slug}/1`);
}
