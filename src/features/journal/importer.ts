import { createHash } from "node:crypto";

import { mediaUrl, sanitizeArticleHtml } from "./content";
import { fetchMediumImage, mediaPath, type ImageType } from "./media";
import { parseMediumPost, placeImages, type ExportFile, type ImportMessage, type ParsedPost } from "./medium";

/**
 * MEDIUM IMPORT RUN (D-129).
 *
 * Every database step is a journal_import_* / journal_register_media call made
 * with the editor's own session, so the database decides (editor only) and
 * the run is recorded (journal_import_runs / journal_import_items).
 *
 * Idempotent per post: the post id is the key, so a second run of the same
 * export reports "unchanged"; a run interrupted half-way is resumed, not
 * duplicated (the article shell and every image path are deterministic).
 *
 * Nothing here publishes. An imported article is a draft and goes through
 * review like any other.
 */

export type ImportOutcome =
  | "created"
  | "updated"
  | "unchanged"
  | "skipped_edited"
  | "skipped_draft"
  | "failed";

export type ImportItem = {
  file: string;
  sourceId: string | null;
  sourceUrl: string | null;
  title: string;
  outcome: ImportOutcome;
  articleId: string | null;
  finalSlug: string | null;
  messages: ImportMessage[];
};

export type ImportReport = { runId: string | null; items: ImportItem[]; problems: string[]; totals: Record<ImportOutcome, number> };

type RpcResult<T> = { data: T | null; error: { message: string } | null };

/** The small surface the run needs. Supplied by the server action; faked in tests. */
export type ImportDeps = {
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<RpcResult<T>>;
  /** Upload into journal-media at `path`; "exists" when a retry finds it already there. */
  upload: (path: string, bytes: Uint8Array, type: ImageType) => Promise<"ok" | "exists" | { error: string }>;
  /** The media row for a path, if a previous attempt registered it. */
  findMedia: (path: string) => Promise<string | null>;
  fetchImage?: typeof fetchMediumImage;
};

export type ImportOptions = { includeDrafts: boolean; sourceName: string };

const shortHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10);

const emptyTotals = (): Record<ImportOutcome, number> => ({
  created: 0, updated: 0, unchanged: 0, skipped_edited: 0, skipped_draft: 0, failed: 0,
});

export async function runMediumImport(files: ExportFile[], problems: string[], deps: ImportDeps, opts: ImportOptions): Promise<ImportReport> {
  const totals = emptyTotals();
  const items: ImportItem[] = [];

  const started = await deps.rpc<string>("journal_import_start", { p_kind: "medium", p_name: opts.sourceName });
  if (started.error || !started.data) {
    return { runId: null, items, problems: [...problems, "The import couldn't start. Only editors can import."], totals };
  }
  const runId = started.data;

  for (const file of files) {
    const item = await importOne(file, deps, opts);
    totals[item.outcome] += 1;
    items.push(item);
    const logged = await deps.rpc("journal_import_log", {
      p_run: runId,
      p_source_id: item.sourceId ?? file.name,
      p_source_url: item.sourceUrl,
      p_title: item.title,
      p_outcome: item.outcome,
      p_article: item.articleId,
      p_slug: item.finalSlug,
      p_messages: item.messages,
    });
    if (logged.error) item.messages.push({ level: "warning", text: "This result couldn't be saved to the import history." });
  }

  await deps.rpc("journal_import_finish", { p_run: runId, p_totals: { ...totals, problems } });
  return { runId, items, problems, totals };
}

async function importOne(file: ExportFile, deps: ImportDeps, opts: ImportOptions): Promise<ImportItem> {
  const parsed = parseMediumPost(file.name, file.html);
  if ("error" in parsed) {
    return { file: file.name, sourceId: null, sourceUrl: null, title: file.name, outcome: "failed", articleId: null, finalSlug: null, messages: [{ level: "error", text: parsed.error }] };
  }
  const base: ImportItem = {
    file: file.name,
    sourceId: parsed.sourceId,
    sourceUrl: parsed.sourceUrl,
    title: parsed.title,
    outcome: "failed",
    articleId: null,
    finalSlug: null,
    messages: [...parsed.messages],
  };
  if (parsed.isDraft && !opts.includeDrafts) {
    return { ...base, outcome: "skipped_draft", messages: [{ level: "info", text: "An unpublished Medium draft. Tick “Include drafts” to import it." }] };
  }

  const prepared = await deps.rpc<{ outcome: "new" | "unchanged" | "update" | "edited"; article_id: string }[]>(
    "journal_import_prepare",
    { p_kind: "medium", p_source_id: parsed.sourceId, p_source_hash: parsed.sourceHash, p_title: parsed.title },
  );
  const row = prepared.data?.[0];
  if (prepared.error || !row) {
    return { ...base, messages: [...base.messages, { level: "error", text: "The database refused this post. Nothing was changed; run the import again to retry." }] };
  }
  base.articleId = row.article_id;
  if (row.outcome === "unchanged") {
    return { ...base, outcome: "unchanged", messages: [{ level: "info", text: "Already imported, and unchanged on Medium. Nothing was done." }] };
  }
  if (row.outcome === "edited") {
    return { ...base, outcome: "skipped_edited", messages: [{ level: "warning", text: "Changed on Medium since the last import, but the WLA draft has been edited, so it was left alone. Compare them by hand." }] };
  }

  const images = await bringImages(parsed, row.article_id, deps, base.messages);
  const lead = parsed.leadImage !== null ? images.get(parsed.leadImage) : undefined;
  // A lead image becomes the featured image instead of repeating in the body.
  const skip = new Set<number>(lead && parsed.leadImage !== null ? [parsed.leadImage] : []);
  const body = sanitizeArticleHtml(placeImages(parsed.bodyWithMarkers, parsed.images, new Map([...images].map(([i, m]) => [i, { url: mediaUrl(m.id) }])), skip));
  if (!body) base.messages.push({ level: "warning", text: "The post body was empty after import." });

  const applied = await deps.rpc<{ final_slug: string; slug_changed: boolean }[]>("journal_import_apply", {
    p_article: row.article_id,
    p_kind: "medium",
    p_source_id: parsed.sourceId,
    p_source_hash: parsed.sourceHash,
    p_source_url: parsed.sourceUrl,
    p_fields: {
      title: parsed.title,
      slug: parsed.slug,
      excerpt: parsed.excerpt ?? "",
      body_html: body,
      author_name: parsed.authorName ?? "",
      featured_media_id: lead?.id ?? "",
      featured_alt: lead ? parsed.images[parsed.leadImage!].alt : "",
      original_published_at: parsed.publishedAt ?? "",
    },
  });
  const done = applied.data?.[0];
  if (applied.error || !done) {
    return { ...base, messages: [...base.messages, { level: "error", text: "The content couldn't be saved. Run the import again to retry; nothing will be duplicated." }] };
  }
  if (done.slug_changed) {
    base.messages.push({ level: "warning", text: `The URL “${parsed.slug}” was already in use, so this article uses “${done.final_slug}”.` });
  }
  return { ...base, outcome: row.outcome === "new" ? "created" : "updated", finalSlug: done.final_slug };
}

async function bringImages(parsed: ParsedPost, articleId: string, deps: ImportDeps, messages: ImportMessage[]) {
  const fetchImage = deps.fetchImage ?? fetchMediumImage;
  const placed = new Map<number, { id: string }>();
  for (const img of parsed.images) {
    const label = `Image ${img.index + 1}`;
    const got = await fetchImage(img.src);
    if ("error" in got) {
      messages.push({ level: "warning", text: `${label} wasn't imported: ${got.error}. Source: ${img.src.slice(0, 120)}` });
      continue;
    }
    // Deterministic, so a retry finds what an interrupted run already stored.
    const path = mediaPath(articleId, `medium-${parsed.sourceId}-${img.index + 1}-${shortHash(img.src)}`, got.type.ext);
    const existing = await deps.findMedia(path);
    if (existing) {
      placed.set(img.index, { id: existing });
      continue;
    }
    const up = await deps.upload(path, got.bytes, got.type);
    if (typeof up === "object") {
      messages.push({ level: "warning", text: `${label} couldn't be stored: ${up.error}.` });
      continue;
    }
    const reg = await deps.rpc<string>("journal_register_media", {
      p_article: articleId,
      p_path: path,
      p_mime: got.type.mime,
      p_bytes: got.bytes.byteLength,
      p_alt: img.alt || null,
      p_source_url: img.src,
    });
    if (reg.error || !reg.data) {
      messages.push({ level: "warning", text: `${label} was stored but couldn't be attached. Run the import again to retry.` });
      continue;
    }
    placed.set(img.index, { id: reg.data });
  }
  return placed;
}
