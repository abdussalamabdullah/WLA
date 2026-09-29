"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, AccessError } from "@/lib/permissions";
import { logError, logInfo } from "@/lib/observability/logger";
import { missionCatalogueSchema, type AdminFormState } from "./schemas";

/**
 * Save a mission's catalogue and detail fields (CMS-01).
 *
 * THE THREE THINGS THIS DELIBERATELY DOES NOT DO
 *
 *  1. It cannot touch `slug`, `version`, `completion_rule` or any screen —
 *     those are not in the schema, so a crafted form post cannot reach them
 *     either. Tech Spec §18 keeps mission logic out of the editor.
 *  2. It cannot corrupt a run in flight. D-17 pins both `mission_version` and
 *     `completion_rule` onto `mission_progress` at start, so a child playing
 *     right now keeps the mission exactly as it was when they began, whatever
 *     is saved here.
 *  3. It cannot escalate. `is_admin` is not an editable field anywhere.
 */
export async function saveMissionAction(
  slug: string,
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    const { supabase } = await requireAdmin();

    const parsed = missionCatalogueSchema.safeParse({
      title: formData.get("title"),
      description: formData.get("description"),
      lab: formData.get("lab"),
      min_age: formData.get("min_age"),
      max_age: formData.get("max_age"),
      duration: formData.get("duration"),
      delivery_type: formData.get("delivery_type"),
      // Entered in pounds, stored in minor units — the form never has to know.
      price_minor: poundsToMinor(formData.get("price")),
      currency: formData.get("currency") ?? "GBP",
      cover_image: formData.get("cover_image"),
      is_free: formData.get("is_free") === "on",
      published: formData.get("published") === "on",
    });

    if (!parsed.success) {
      return {
        ok: false,
        message: "Some fields need attention.",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<
          string,
          string[]
        >,
      };
    }

    const v = parsed.data;
    const { error } = await supabase
      .from("missions")
      .update({
        title: v.title,
        description: v.description || null,
        lab: v.lab,
        min_age: v.min_age,
        max_age: v.max_age,
        duration: v.duration || null,
        delivery_type: v.delivery_type,
        price_minor: v.price_minor,
        currency: v.currency,
        cover_image: v.cover_image || null,
        is_free: v.is_free,
        published: v.published,
      })
      .eq("slug", slug);

    if (error) {
      const ref = logError("admin_mission_save_failed", error, { slug });
      return { ok: false, message: `That didn't save. Reference ${ref}.` };
    }

    // Identifiers only — never the edited content itself.
    logInfo("admin_mission_saved", { slug, published: v.published });

    revalidatePath("/admin");
    revalidatePath(`/admin/missions/${slug}`);
    revalidatePath(`/missions/${slug}`);
    revalidatePath("/missions");
    revalidatePath(`/academy/missions/${slug}`);

    return { ok: true, message: "Saved." };
  } catch (error) {
    if (error instanceof AccessError) {
      return { ok: false, message: "You do not have access to edit content." };
    }
    const ref = logError("admin_mission_save_threw", error, { slug });
    return { ok: false, message: `Something went wrong. Reference ${ref}.` };
  }
}

/**
 * Pounds (what an editor types) → minor units (what commerce stores).
 *
 * Empty means "no price", which is not the same as zero: a mission with no
 * price is not purchasable, a mission priced at zero would be.
 */
function poundsToMinor(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const pounds = Number(text);
  if (!Number.isFinite(pounds)) return Number.NaN; // fails the schema, as it should
  return Math.round(pounds * 100);
}
