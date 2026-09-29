import { z } from "zod";

/**
 * THE EDITABLE CONTENT BOUNDARY — CMS-01, PRD §28, Tech Spec §39.
 *
 * This schema IS the boundary. A field that is not here cannot be written by
 * the admin interface, and the list was chosen from the requirements rather
 * than from what happens to be in the table:
 *
 *   PRD §32 (Academy core scope)  — "Mission catalogue editing: Yes"
 *                                   "Mission Detail editing: Yes"
 *                                   "Journal CMS: Public website scope,
 *                                    not Academy core"
 *
 * WHAT IS DELIBERATELY NOT EDITABLE, AND WHY
 *
 *   slug            — the permanent address of a mission. Changing it breaks
 *                     every link a family already holds, and the Academy keys
 *                     Mission Home on it. A rename is a migration, not an edit.
 *   version         — D-17. The version is what an in-progress run is pinned
 *                     to; editing it by hand would silently re-point live runs.
 *   completion_rule — what "complete" means. It is snapshotted onto each run
 *                     at start, so editing it here cannot corrupt a run in
 *                     flight — but it is mission LOGIC, not catalogue content,
 *                     and Tech Spec §18 keeps mission logic out of the editor.
 *   mission_screens — the same reason, emphatically. Tech Spec §18: "We are
 *                     not building a no-code mission builder." Screens are
 *                     authored as seed SQL and reviewed.
 *   is_admin        — not content. No interface writes it.
 *
 * `published` IS editable, because deciding a mission is ready to sell is
 * exactly the kind of operational decision the client should not need a
 * developer for. It is guarded in the action, not here.
 */
export const missionCatalogueSchema = z
  .object({
    title: z.string().trim().min(1, "A mission needs a title.").max(120),
    description: z
      .string()
      .trim()
      .max(600, "Keep the catalogue description under 600 characters.")
      .optional()
      .or(z.literal("")),
    lab: z.enum([
      "challenge",
      "decision",
      "curiosity",
      "wellbeing",
      "navigation",
    ]),
    min_age: z.coerce.number().int().min(4).max(18),
    max_age: z.coerce.number().int().min(4).max(18),
    duration: z.string().trim().max(40).optional().or(z.literal("")),
    delivery_type: z.enum(["physical", "hybrid", "digital"]),
    /**
     * Minor units, always paired with currency (D-09). Entered in pounds by the
     * form and converted once, server-side, so no interface ever has to know
     * that £12 is 1200.
     */
    price_minor: z.coerce
      .number()
      .int()
      .min(0, "A price cannot be negative.")
      .max(1_000_00)
      .nullable(),
    currency: z.string().trim().length(3).toUpperCase(),
    cover_image: z.string().trim().max(400).optional().or(z.literal("")),
    is_free: z.boolean(),
    published: z.boolean(),
  })
  .refine((m) => m.max_age >= m.min_age, {
    message: "The maximum age cannot be below the minimum age.",
    path: ["max_age"],
  })
  /*
   * A mission is either free or priced. Letting both be true would make
   * `acquireMission` ambiguous about which path a child took, and the
   * entitlement source would stop meaning anything.
   */
  .refine((m) => !(m.is_free && (m.price_minor ?? 0) > 0), {
    message: "A free mission cannot also carry a price.",
    path: ["price_minor"],
  });

export type MissionCatalogueInput = z.infer<typeof missionCatalogueSchema>;

/**
 * Form state for the admin editor.
 *
 * Lives here, NOT in actions.ts. A `"use server"` module may export only async
 * functions — exporting this object from there makes every import of the
 * module throw at evaluation, which took down the whole editor page rather
 * than just the save. The type would have been fine (types are erased); the
 * value is not.
 */
export type AdminFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const emptyAdminState: AdminFormState = { ok: false };
