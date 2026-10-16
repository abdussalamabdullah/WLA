import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logWarn } from "@/lib/observability/logger";
import type { Database } from "@/types/database";

/**
 * REMOVE UPLOADS NOBODY USES (D-135), with the author's own session.
 *
 * The database decides what may go (journal_unused_media): images no version
 * of the article refers to, never a public one, never one uploaded in the
 * last 24 hours, and files that were never registered. A registered image is
 * first FORGOTTEN in the database — so nothing can refer to it any more —
 * and only then is its file removed; the storage delete policy refuses any
 * file that still has a database row. Runs after a successful save; any
 * failure is logged and left for the next save.
 */
export async function removeUnusedMedia(supabase: SupabaseClient<Database>, articleId: string): Promise<number> {
  const { data, error } = await supabase.rpc("journal_unused_media", { p_article: articleId });
  if (error) {
    logWarn("journal_media_cleanup_failed", { step: "list", reason: error.message });
    return 0;
  }
  let removed = 0;
  for (const row of data ?? []) {
    let path = row.storage_path;
    if (row.media_id) {
      const forgot = await supabase.rpc("journal_forget_media", { p_media: row.media_id });
      if (forgot.error || !forgot.data) continue; // e.g. it became used meanwhile
      path = forgot.data;
    }
    const { error: removeError } = await supabase.storage.from("journal-media").remove([path]);
    if (removeError) logWarn("journal_media_cleanup_failed", { step: "remove", reason: removeError.message });
    else removed++;
  }
  return removed;
}
