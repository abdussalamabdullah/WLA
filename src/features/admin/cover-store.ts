import "server-only";

import { logWarn } from "@/lib/observability/logger";
import type { createClient } from "@/lib/supabase/server";
import { COVER_BUCKET, coverObjectName, isBucketCover } from "@/features/missions/covers";

type Client = Awaited<ReturnType<typeof createClient>>;

/** An upload nobody saved is left this long, in case the form is still open. */
const ABANDONED_AFTER_MS = 60 * 60 * 1000;

/**
 * Tidying mission covers (D-146), always with the administrator's own session.
 * Best effort: a file left behind costs disk, never correctness. The storage
 * policy refuses to delete anything a mission still references, so a mistake or a
 * race here can't remove a live image.
 */
export async function removeCoverIfUnused(supabase: Client, value: string): Promise<void> {
  if (!isBucketCover(value)) return;
  const { count, error } = await supabase
    .from("missions")
    .select("id", { count: "exact", head: true })
    .eq("cover_image", value);
  if (error || count !== 0) return;
  const { error: removeError } = await supabase.storage.from(COVER_BUCKET).remove([coverObjectName(value)]);
  if (removeError) logWarn("mission_cover_remove_failed", { reason: removeError.message });
}

/** Uploads to this mission's folder that were never saved, once they are old enough. */
export async function sweepAbandonedCovers(supabase: Client, missionId: string): Promise<void> {
  const { data: files, error } = await supabase.storage.from(COVER_BUCKET).list(missionId, { limit: 100 });
  if (error || !files) return;
  const cutoff = Date.now() - ABANDONED_AFTER_MS;
  for (const file of files) {
    if (!file.created_at || new Date(file.created_at).getTime() > cutoff) continue;
    await removeCoverIfUnused(supabase, `${COVER_BUCKET}/${missionId}/${file.name}`);
  }
}

/** After a successful save: the file just replaced, then anything abandoned. */
export async function tidyCovers(supabase: Client, missionId: string, replaced: string | null): Promise<void> {
  try {
    if (replaced) await removeCoverIfUnused(supabase, replaced);
    await sweepAbandonedCovers(supabase, missionId);
  } catch {
    logWarn("mission_cover_tidy_failed", { missionId });
  }
}
