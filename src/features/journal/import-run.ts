import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { runMediumImport } from "./importer";
import { MAX_ARCHIVE_BYTES, readExport } from "./medium";

/**
 * ONE MEDIUM IMPORT RUN (D-129), from uploaded files, as the signed-in editor.
 *
 * Unchanged rules: every post becomes a DRAFT (nothing is published), the
 * same export imported again is skipped or updated without duplicates, a
 * post edited here is never overwritten, and images are fetched only from
 * Medium's own hosts. The editor's own session does every database and
 * storage write, so RLS and the journal_import_* functions still decide.
 */
export async function importUploads(
  supabase: SupabaseClient<Database>,
  uploads: File[],
  opts: { includeDrafts: boolean },
): Promise<{ runId: string } | { error: string }> {
  if (uploads.length === 0) return { error: "Choose Medium's export .zip, or one or more post .html files." };
  const total = uploads.reduce((n, f) => n + f.size, 0);
  if (total > MAX_ARCHIVE_BYTES) return { error: "The upload is larger than 50 MB. Import it in parts." };
  const { files, problems } = readExport(
    await Promise.all(uploads.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))),
  );
  if (files.length === 0) return { error: problems.join(" ") || "No posts were found to import." };

  const report = await runMediumImport(files, problems, {
    rpc: async (fn, args) => {
      const { data, error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>)(fn, args);
      return { data: data as never, error };
    },
    upload: async (path, bytes, type) => {
      const { error } = await supabase.storage.from("journal-media").upload(path, bytes, { contentType: type.mime, upsert: false });
      if (!error) return "ok";
      return /exists|duplicate/i.test(error.message) ? "exists" : { error: "storage refused the file" };
    },
    findMedia: async (path) => {
      const { data } = await supabase.from("journal_media").select("id").eq("storage_path", path).maybeSingle();
      return data?.id ?? null;
    },
  }, { includeDrafts: opts.includeDrafts, sourceName: uploads.map((f) => f.name).join(", ").slice(0, 200) });

  if (!report.runId) return { error: report.problems.join(" ") || "The import couldn't start." };
  return { runId: report.runId };
}
