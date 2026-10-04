"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/permissions";
import { logWarn } from "@/lib/observability/logger";

/**
 * F7 — MISSION MEDIA AUTHORING.
 *
 * Same model as the Kit (D-63): files go up with the ADMIN'S OWN SESSION
 * under a fresh name (never overwritten), and the row is written by a
 * security-definer function that requires a draft and a path inside the
 * mission's folder. Learners never read the bucket; the server signs what the
 * current screen needs (store.signMedia).
 */

export type AssetState = { error?: string; ok?: boolean; fieldErrors?: Record<string, string> };

const KINDS = ["image", "diagram", "map", "animation", "audio", "video"] as const;
const MAX_BYTES = 50 * 1024 * 1024;

/** What each kind may be. Checked on the server; the browser's `accept` is a convenience. */
const MIME: Record<(typeof KINDS)[number], RegExp> = {
  image: /^image\/(png|jpeg|webp|gif|svg\+xml)$/,
  diagram: /^image\/(png|jpeg|webp|svg\+xml)$/,
  map: /^image\/(png|jpeg|webp|svg\+xml)$/,
  animation: /^image\/(gif|webp|png)$/,
  audio: /^audio\/(mpeg|mp4|ogg|wav|x-wav|webm)$/,
  video: /^video\/(mp4|webm)$/,
};

const schema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "Lower case letters, digits and _ only, starting with a letter."),
  kind: z.enum(KINDS),
  alt_text: z.string().trim().max(500).optional(),
  long_description: z.string().trim().max(4000).optional(),
  transcript: z.string().trim().max(20000).optional(),
});

function safeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
}

export async function saveAssetAction(_prev: AssetState, formData: FormData): Promise<AssetState> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const existingPath = String(formData.get("existingPath") ?? "") || null;
  const existingCaptions = String(formData.get("existingCaptions") ?? "") || null;

  const parsed = schema.safeParse({
    key: formData.get("key"),
    kind: formData.get("kind"),
    alt_text: formData.get("alt_text") ?? "",
    long_description: formData.get("long_description") ?? "",
    transcript: formData.get("transcript") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { fieldErrors };
  }
  const d = parsed.data;
  // Accessibility is part of the asset, not an afterthought (validator blocks publish without it).
  if (["image", "diagram", "map", "animation"].includes(d.kind) && !d.alt_text) {
    return { fieldErrors: { alt_text: "Describe what the picture shows — a child who can't see it needs this." } };
  }
  if (d.kind === "audio" && !d.transcript) return { fieldErrors: { transcript: "Audio needs a transcript." } };

  const { supabase } = await requireAdmin();
  const upload = async (file: File, prefix: string) => {
    const path = `${missionId}/media/${prefix}${Date.now()}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from("mission-media").upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      logWarn("media_upload_failed", { missionId, reason: error.message });
      return null;
    }
    return path;
  };

  let storagePath = existingPath;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { fieldErrors: { file: "That file is larger than 50 MB." } };
    if (!MIME[d.kind].test(file.type)) return { fieldErrors: { file: `That file type isn't used for ${d.kind}.` } };
    storagePath = await upload(file, "");
    if (!storagePath) return { error: "We couldn't upload that file. Please try again." };
  }
  if (!storagePath) return { fieldErrors: { file: "Choose a file." } };

  let captionsPath = existingCaptions;
  const captions = formData.get("captions");
  if (captions instanceof File && captions.size > 0) {
    if (d.kind !== "video") return { fieldErrors: { captions: "Captions are for video." } };
    if (!/\.vtt$/i.test(captions.name) || captions.size > 1024 * 1024) return { fieldErrors: { captions: "Use a WebVTT (.vtt) file under 1 MB." } };
    captionsPath = await upload(new File([captions], captions.name, { type: "text/vtt" }), "captions-");
    if (!captionsPath) return { error: "We couldn't upload the captions. Please try again." };
  }
  if (d.kind === "video" && !captionsPath && !d.transcript) {
    return { fieldErrors: { captions: "Video needs captions or a transcript." } };
  }

  const { error } = await supabase.rpc("admin_upsert_asset", {
    p_mission_id: missionId,
    p_version: version,
    p_key: d.key,
    p_kind: d.kind,
    p_storage_path: storagePath,
    p_alt_text: d.alt_text ?? null,
    p_long_description: d.long_description ?? null,
    p_transcript: d.transcript ?? null,
    p_captions_path: captionsPath,
  });
  if (error) {
    if (error.message.includes("version_not_editable")) return { error: "This version is published and can't be changed. Create a new version." };
    logWarn("media_save_failed", { missionId, reason: error.message });
    return { error: "We couldn't save that media." };
  }
  revalidatePath(`/admin/builder/${slug}/${version}`);
  return { ok: true };
}

export async function deleteAssetAction(formData: FormData): Promise<void> {
  const missionId = String(formData.get("missionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const version = Number(formData.get("version") ?? 0);
  const key = String(formData.get("key") ?? "");
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_delete_asset", { p_mission_id: missionId, p_version: version, p_key: key });
  if (error) logWarn("media_delete_failed", { missionId, reason: error.message });
  revalidatePath(`/admin/builder/${slug}/${version}`);
}
