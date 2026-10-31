"use server";

import { z } from "zod";
import { AccessError, requireAdmin } from "@/lib/permissions";
import { logWarn } from "@/lib/observability/logger";
import { imageProblem, sniffImage } from "@/features/journal/media";
import { COVER_BUCKET, coverObjectName, isBucketCover, isCoverObjectFor } from "@/features/missions/covers";
import { removeCoverIfUnused, sweepAbandonedCovers } from "./cover-store";

/**
 * Mission cover uploads (D-146). The browser sends the file straight to storage
 * with the admin's own session, because a server action is limited to 1 MB. The
 * bucket checks the size and the declared type. This reads the bytes back and
 * checks what the file really is. Nothing changes on the mission until the
 * administrator presses Save.
 */
export type CoverUploadResult = { value: string } | { error: string };

const COVER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const TYPE_MESSAGE = "Use a PNG, JPEG or WebP image.";
const missionIdSchema = z.string().uuid();

export async function registerCoverUploadAction(missionId: string, objectName: string): Promise<CoverUploadResult> {
  let supabase;
  try {
    ({ supabase } = await requireAdmin());
  } catch (error) {
    if (error instanceof AccessError) return { error: "You do not have access to edit content." };
    throw error;
  }
  if (!missionIdSchema.safeParse(missionId).success || !isCoverObjectFor(missionId, objectName)) {
    return { error: "That upload isn't in this mission's folder." };
  }

  const bucket = supabase.storage.from(COVER_BUCKET);
  const { data: file, error } = await bucket.download(objectName);
  if (error || !file) return { error: "The upload couldn't be found. Try again." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImage(bytes);
  const problem =
    imageProblem(bytes) ??
    (!type || !COVER_TYPES.has(type.mime) || !objectName.endsWith(`.${type.ext}`) || file.type !== type.mime
      ? TYPE_MESSAGE
      : null);
  if (problem) {
    const { error: removeError } = await bucket.remove([objectName]);
    if (removeError) logWarn("mission_cover_reject_remove_failed", { missionId, reason: removeError.message });
    return { error: problem === "Use a PNG, JPEG, WebP or GIF image." ? TYPE_MESSAGE : problem };
  }

  await sweepAbandonedCovers(supabase, missionId).catch(() => {});
  return { value: `${COVER_BUCKET}/${objectName}` };
}

/** An upload replaced or removed before it was ever saved. In use elsewhere: kept. */
export async function discardCoverUploadAction(missionId: string, value: string): Promise<void> {
  const { supabase } = await requireAdmin();
  if (!isBucketCover(value) || !isCoverObjectFor(missionId, coverObjectName(value))) return;
  await removeCoverIfUnused(supabase, value);
}
