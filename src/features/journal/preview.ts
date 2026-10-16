import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { boundedFetch } from "@/lib/supabase/fetch";
import type { Database, JournalPreviewArticleRow } from "@/types/database";

/**
 * PRIVATE PREVIEW LINKS, read side (D-134).
 *
 * The token in the link is the only key. Reads go through two database
 * functions with an ANONYMOUS, cookie-less client — so a signed-in visitor
 * gets exactly what anyone else with the link gets — and those functions
 * return the latest saved version of ONE article, or nothing for a bad,
 * revoked or expired link (the same answer as a link that never existed).
 * Nothing here can write: a link is view-only by construction.
 */
export const PREVIEW_TOKEN = /^[A-Za-z0-9_-]{43}$/;

function anon() {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: boundedFetch },
  });
}

export class PreviewUnavailable extends Error {}

export async function getPreview(token: string): Promise<JournalPreviewArticleRow | null> {
  if (!PREVIEW_TOKEN.test(token)) return null;
  const { data, error } = await anon().rpc("journal_preview_article", { p_token: token });
  if (error) throw new PreviewUnavailable();
  return data?.[0] ?? null;
}

/** The storage path of an image this preview may show, or null. */
export async function getPreviewMediaPath(token: string, mediaId: string): Promise<string | null> {
  if (!PREVIEW_TOKEN.test(token) || !/^[0-9a-f-]{36}$/.test(mediaId)) return null;
  const { data, error } = await anon().rpc("journal_preview_media_path", { p_token: token, p_media: mediaId });
  if (error) throw new PreviewUnavailable();
  return data ?? null;
}

export const previewMediaUrl = (token: string, mediaId: string) => `/journal-preview/${token}/media/${mediaId}`;
