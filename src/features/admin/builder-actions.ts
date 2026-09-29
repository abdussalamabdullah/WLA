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

  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("create_mission_version", {
    p_mission_id: missionId,
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
