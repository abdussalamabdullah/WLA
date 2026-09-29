"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/permissions";
import { logWarn } from "@/lib/observability/logger";
import type { ResourceType } from "@/types/database";

/**
 * MISSION KIT AND PARENT NOTE AUTHORING — D-63.
 *
 * Files are uploaded with the ADMIN'S OWN SESSION, not a service-role client.
 * The bucket gained an admin insert/update/delete policy; it did not become
 * public and the family read policy is untouched. So authoring uses the same
 * authorisation model as everything else an admin does, and an admin who loses
 * `is_admin` immediately loses the ability to write files.
 *
 * Every database write goes through a `security definer` function that
 * re-checks is_admin() AND that the version is still a draft. The old
 * `for all using (is_admin())` policies on these two tables are gone.
 */

export type KitState = {
  error?: string;
  ok?: boolean;
  fieldErrors?: Record<string, string>;
};

const RESOURCE_TYPES: ResourceType[] = ["pdf", "image", "document", "other"];

/** 20 MB. Kit printables are a few hundred KB; this is a sanity bound, not a
 *  product limit, and it fails loudly rather than truncating. */
const MAX_BYTES = 20 * 1024 * 1024;

const resourceSchema = z.object({
  title: z.string().trim().min(1, "Give the resource a name."),
  description: z.string().trim().optional(),
  type: z.enum(RESOURCE_TYPES as [ResourceType, ...ResourceType[]]),
  can_view: z.boolean(),
  can_print: z.boolean(),
  can_download: z.boolean(),
  sort_order: z.coerce.number().int(),
});

/** Keep a filename recognisable but safe to put in a storage path. */
function safeName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "file";
}

export async function saveKitResourceAction(
  _prev: KitState,
  formData: FormData,
): Promise<KitState> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const existingId = String(formData.get("resourceId") ?? "") || null;
  const existingPath = String(formData.get("existingPath") ?? "") || null;

  const parsed = resourceSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    type: formData.get("type"),
    can_view: formData.get("can_view") === "on",
    can_print: formData.get("can_print") === "on",
    can_download: formData.get("can_download") === "on",
    sort_order: formData.get("sort_order") ?? 0,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { fieldErrors };
  }

  const { supabase } = await requireAdmin();

  const file = formData.get("file");
  let storagePath = existingPath;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return { fieldErrors: { file: "That file is larger than 20 MB." } };
    }
    /*
     * The path MUST start with the mission id: the bucket's read policy keys
     * entitlement on the first path segment, so a file filed under another
     * mission's folder would be handed to the wrong families. The database
     * function refuses a mismatch as well — this is the first of two checks,
     * not the only one.
     */
    storagePath = `${missionId}/${Date.now()}-${safeName(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from("mission-resources")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      logWarn("kit_upload_failed", { missionId, reason: uploadError.message });
      return { error: "We couldn't upload that file. Please try again." };
    }
  }

  if (!storagePath) {
    return { fieldErrors: { file: "Choose a file for this resource." } };
  }

  const { error } = await supabase.rpc("admin_upsert_resource", {
    p_mission_id: missionId,
    p_version: version,
    p_id: existingId,
    p_title: parsed.data.title,
    p_description: parsed.data.description ?? null,
    p_type: parsed.data.type,
    p_storage_path: storagePath,
    p_can_view: parsed.data.can_view,
    p_can_print: parsed.data.can_print,
    p_can_download: parsed.data.can_download,
    p_sort_order: parsed.data.sort_order,
  });

  if (error) {
    if (error.message.includes("version_not_editable")) {
      return { error: "This version is published and can't be changed. Create a new version." };
    }
    if (error.message.includes("resource_path_outside_mission")) {
      return { error: "That file doesn't belong to this mission." };
    }
    logWarn("kit_save_failed", { missionId, reason: error.message });
    return { error: "We couldn't save that resource." };
  }

  revalidatePath(`/admin/builder/${slug}/${version}`);
  return { ok: true };
}

export async function deleteKitResourceAction(
  _prev: KitState,
  formData: FormData,
): Promise<KitState> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const id = String(formData.get("resourceId") ?? "");

  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_delete_resource", {
    p_mission_id: missionId, p_version: version, p_id: id,
  });
  if (error) return { error: "We couldn't remove that resource." };

  /*
   * The stored FILE is deliberately left in place. Another version may point
   * at the same path — create_mission_version copies rows, not files — so
   * deleting the object here would silently break a published version's Kit.
   * Orphaned files are a housekeeping matter, not a correctness one.
   */
  revalidatePath(`/admin/builder/${slug}/${version}`);
  return { ok: true };
}

export async function moveKitResourceAction(formData: FormData): Promise<void> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const id = String(formData.get("resourceId") ?? "");
  const direction = String(formData.get("direction") ?? "up") as "up" | "down";

  const { supabase } = await requireAdmin();
  await supabase.rpc("admin_move_resource", {
    p_mission_id: missionId, p_version: version, p_id: id, p_direction: direction,
  });
  revalidatePath(`/admin/builder/${slug}/${version}`);
}

// ------------------------------------------------------------- parent note --
const noteSchema = z.object({
  content: z.string().trim().min(1, "Write something for parents."),
});

export async function saveParentNoteAction(
  _prev: KitState,
  formData: FormData,
): Promise<KitState> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const existingPath = String(formData.get("existingPath") ?? "") || null;

  const parsed = noteSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) {
    return { fieldErrors: { content: parsed.error.issues[0].message } };
  }

  const { supabase } = await requireAdmin();

  let documentPath = existingPath;
  const file = formData.get("document");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return { fieldErrors: { document: "That file is larger than 20 MB." } };
    }
    documentPath = `${missionId}/${Date.now()}-${safeName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("mission-resources")
      .upload(documentPath, file, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });
    if (uploadError) {
      logWarn("note_upload_failed", { missionId, reason: uploadError.message });
      return { error: "We couldn't upload that document." };
    }
  }

  const { error } = await supabase.rpc("admin_save_parent_note", {
    p_mission_id: missionId,
    p_version: version,
    p_content: parsed.data.content,
    p_document_path: documentPath,
  });

  if (error) {
    if (error.message.includes("version_not_editable")) {
      return { error: "This version is published and can't be changed." };
    }
    logWarn("note_save_failed", { missionId, reason: error.message });
    return { error: "We couldn't save the parent note." };
  }

  revalidatePath(`/admin/builder/${slug}/${version}`);
  return { ok: true };
}
