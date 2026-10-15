"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { AccessError } from "@/lib/permissions";
import { requireJournalEditor, requireJournalStaff } from "@/lib/permissions/journal";
import { logAccessDenied, logWarn } from "@/lib/observability/logger";
import type { Json } from "@/types/database";
import { mediaUrl, normaliseTags, sanitizeArticleHtml, slugify, slugProblem } from "./content";
import { journalErrorCode, journalErrorMessage } from "./errors";
import { imageProblem, mediaPath, sniffImage } from "./media";
import { formatLondon, londonWallTimeToUtc } from "./time";

/**
 * JOURNAL STUDIO ACTIONS (D-123 … D-133).
 *
 * Each action: (1) checks the caller is Journal staff — for a clear message,
 * not for security; (2) validates and SANITISES input; (3) calls one journal_*
 * function with the caller's own session. Step 3 is the control: the database
 * re-checks the role, the article membership, the revision state and the
 * content hash, whatever this file does (scripts/journal-regression.sql).
 */

export type JournalState = {
  ok?: boolean;
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  /** A stale save (D-128): who saved last, and when. Their text stays in the form. */
  conflict?: { by: string | null; at: string; lockVersion: number };
  lockVersion?: number;
  mediaId?: string;
  mediaUrl?: string;
};

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function staff() {
  try {
    return await requireJournalStaff();
  } catch (e) {
    if (e instanceof AccessError) {
      logAccessDenied("journal_action", { reason: e.reason });
      return null;
    }
    throw e;
  }
}

function refresh(articleId?: string) {
  revalidatePath("/editorial");
  if (articleId) revalidatePath(`/editorial/articles/${articleId}`);
  revalidatePath("/journal", "layout");
}

function refused(error: { message: string }, op: string): JournalState {
  if (!journalErrorCode(error)) logWarn("journal_action_failed", { op, reason: error.message });
  return { error: journalErrorMessage(error) };
}

const NOT_STAFF: JournalState = { error: "You don't have access to the Journal studio." };

// ------------------------------------------------------------- articles --
export async function createArticleAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const s = await staff();
  if (!s) return NOT_STAFF;
  const title = str(fd, "title").trim();
  if (!title) return { fieldErrors: { title: "Give the article a working title." } };
  if (title.length > 200) return { fieldErrors: { title: "Keep the title under 200 characters." } };
  const { data, error } = await s.supabase.rpc("journal_create_article", { p_title: title, p_slug: slugify(title) });
  if (error) {
    // A title whose slug is taken still creates the article — without a slug.
    if (journalErrorCode(error) === "slug_taken") {
      const retry = await s.supabase.rpc("journal_create_article", { p_title: title, p_slug: "" });
      if (retry.error) return refused(retry.error, "create");
      refresh();
      redirect(`/editorial/articles/${retry.data}?notice=slug`);
    }
    return refused(error, "create");
  }
  refresh();
  redirect(`/editorial/articles/${data}`);
}

const revisionSchema = z.object({
  title: z.string().trim().min(1, "Add a title.").max(200, "Keep the title under 200 characters."),
  slug: z.string().trim(),
  excerpt: z.string().trim().max(600, "Keep the excerpt under 600 characters."),
  body_html: z.string().max(400000, "The article is too long to save in one piece."),
  author_name: z.string().trim().max(120),
  category_id: z.union([z.literal(""), z.uuid()]),
  tags: z.string().max(1000),
  featured_media_id: z.union([z.literal(""), z.uuid()]),
  featured_alt: z.string().trim().max(500),
  seo_title: z.string().trim().max(200, "Keep the search title under 200 characters."),
  seo_description: z.string().trim().max(320, "Keep the search description under 320 characters."),
  canonical_url: z.union([z.literal(""), z.url({ protocol: /^https$/, message: "Use a full https:// address." })]),
  original_published_at: z.union([z.literal(""), z.iso.date("Use a date.")]),
});

export async function saveRevisionAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const s = await staff();
  if (!s) return NOT_STAFF;
  const revisionId = str(fd, "revisionId");
  const articleId = str(fd, "articleId");
  const lock = Number(str(fd, "lockVersion"));
  const parsed = revisionSchema.safeParse(Object.fromEntries(Object.keys(revisionSchema.shape).map((k) => [k, str(fd, k)])));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { fieldErrors };
  }
  const d = parsed.data;
  if (d.slug) {
    const problem = slugProblem(d.slug);
    if (problem) return { fieldErrors: { slug: problem } };
  }
  if (d.featured_media_id && !d.featured_alt) {
    return { fieldErrors: { featured_alt: "Describe the featured image for people who can't see it." } };
  }

  const fields = {
    title: d.title,
    slug: d.slug,
    excerpt: d.excerpt,
    // Sanitised HERE, before it is stored; and again whenever it is rendered.
    body_html: sanitizeArticleHtml(d.body_html),
    author_name: d.author_name,
    category_id: d.category_id,
    tags: normaliseTags(d.tags),
    featured_media_id: d.featured_media_id,
    featured_alt: d.featured_alt,
    seo_title: d.seo_title,
    seo_description: d.seo_description,
    canonical_url: d.canonical_url,
    original_published_at: d.original_published_at ? `${d.original_published_at}T12:00:00Z` : "",
  };
  const { data, error } = await s.supabase.rpc("journal_save_revision", {
    p_revision: revisionId,
    p_expected_lock: lock,
    p_fields: fields as unknown as Json,
  });
  if (error) {
    const code = journalErrorCode(error);
    if (code === "slug_taken" || code === "slug_invalid") return { fieldErrors: { slug: journalErrorMessage(error) } };
    return refused(error, "save");
  }
  const row = data?.[0];
  if (!row) return { error: "That didn't save. Please try again." };
  if (row.outcome === "conflict") {
    const people = await s.supabase.rpc("journal_staff_directory", {});
    const who = (people.data ?? []).find((p) => p.profile_id === row.updated_by);
    return {
      error: "Someone else saved this version while you were editing. Your text is still here — compare it with theirs before saving again.",
      conflict: { by: who ? who.name || who.email : null, at: row.updated_at, lockVersion: row.lock_version },
    };
  }
  refresh(articleId);
  return { ok: true, lockVersion: row.lock_version, notice: row.outcome === "unchanged" ? "Nothing had changed." : "Saved." };
}

/** A single workflow step that needs only ids. */
async function step(fd: FormData, op: string, call: (s: NonNullable<Awaited<ReturnType<typeof staff>>>) => PromiseLike<{ error: { message: string } | null }>, notice: string): Promise<JournalState> {
  const s = await staff();
  if (!s) return NOT_STAFF;
  const { error } = await call(s);
  if (error) return refused(error, op);
  refresh(str(fd, "articleId"));
  return { ok: true, notice };
}

export async function startRevisionAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  return step(fd, "start", (s) => s.supabase.rpc("journal_start_revision", { p_article: str(fd, "articleId") }), "A new version is ready to edit. The published version stays live until this one is approved and published.");
}

export async function submitAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  return step(fd, "submit", (s) => s.supabase.rpc("journal_submit_for_review", { p_revision: str(fd, "revisionId"), p_expected_lock: Number(str(fd, "lockVersion")) }), "Submitted for an optional review. It is locked until a reviewer responds or you withdraw it; you can still publish it.");
}

export async function withdrawAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  return step(fd, "withdraw", (s) => s.supabase.rpc("journal_withdraw_submission", { p_revision: str(fd, "revisionId") }), "Withdrawn from review. You can edit it again.");
}

export async function assignReviewerAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const reviewer = str(fd, "reviewerId");
  if (!reviewer) return { fieldErrors: { reviewerId: "Choose a reviewer." } };
  const assign = str(fd, "assign") !== "0";
  return step(fd, "assign", (s) => s.supabase.rpc("journal_assign_reviewer", { p_article: str(fd, "articleId"), p_reviewer: reviewer, p_assign: assign }), assign ? "Reviewer assigned." : "Reviewer removed.");
}

export async function setMemberAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const profile = str(fd, "profileId");
  if (!profile) return { fieldErrors: { profileId: "Choose a person." } };
  const role = str(fd, "role");
  return step(fd, "member", (s) => s.supabase.rpc("journal_set_member", {
    p_article: str(fd, "articleId"),
    p_profile: profile,
    p_role: role === "author" || role === "collaborator" ? role : null,
  }), role ? "Access updated." : "Removed from this article.");
}

export async function decideAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const decision = str(fd, "decision") === "approve" ? "approve" : "request_changes";
  const note = str(fd, "note").trim();
  if (decision === "request_changes" && !note) return { fieldErrors: { note: "Say what needs to change." } };
  if (note.length > 5000) return { fieldErrors: { note: "Keep the note under 5,000 characters." } };
  return step(fd, "decide", (s) => s.supabase.rpc("journal_decide", {
    p_revision: str(fd, "revisionId"),
    p_decision: decision,
    p_expected_hash: str(fd, "contentHash"),
    p_note: note || null,
  }), decision === "approve" ? "Approved. Your approval is recorded against exactly this content." : "Changes requested. The writer can edit it again.");
}

export async function addCommentAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const body = str(fd, "body").trim();
  if (!body) return { fieldErrors: { body: "Write a comment first." } };
  if (body.length > 5000) return { fieldErrors: { body: "Keep comments under 5,000 characters." } };
  return step(fd, "comment", (s) => s.supabase.rpc("journal_add_comment", {
    p_article: str(fd, "articleId"),
    p_revision: str(fd, "revisionId") || null,
    p_body: body,
    p_parent: str(fd, "parentId") || null,
    p_anchor: str(fd, "anchor").trim().slice(0, 500) || null,
  }), "Comment added. Only Journal staff can see it.");
}

export async function resolveCommentAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const resolved = str(fd, "resolved") !== "0";
  return step(fd, "resolve", (s) => s.supabase.rpc("journal_resolve_comment", { p_comment: str(fd, "commentId"), p_resolved: resolved }), resolved ? "Marked resolved." : "Reopened.");
}

// ---------------------------------------------------------- publishing --
export async function publishAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  return step(fd, "publish", (s) => s.supabase.rpc("journal_publish", { p_revision: str(fd, "revisionId"), p_expected_hash: str(fd, "contentHash") }), "Published. This version is now live on the public Journal.");
}

export async function scheduleAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  // Entered as Europe/London wall time whatever the editor's device zone (D-133).
  const local = str(fd, "atLocal");
  const at = londonWallTimeToUtc(local);
  if (!at.ok) {
    return {
      fieldErrors: {
        atLocal: at.reason === "nonexistent"
          ? "That time doesn't exist in the UK — the clocks go forward then. Choose another time."
          : "Choose a date and time.",
      },
    };
  }
  return step(fd, "schedule", (s) => s.supabase.rpc("journal_schedule", {
    p_revision: str(fd, "revisionId"),
    p_expected_hash: str(fd, "contentHash"),
    p_at: at.utc.toISOString(),
  }), `Scheduled for ${formatLondon(at.utc)}${at.ambiguous ? " — the first of the two 01:00–02:00 hours as the clocks go back" : ""}. It will be published automatically; this version is locked until then.`);
}

export async function cancelScheduleAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  return step(fd, "unschedule", (s) => s.supabase.rpc("journal_cancel_schedule", { p_article: str(fd, "articleId") }), "Schedule cancelled.");
}

export async function unpublishAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  return step(fd, "unpublish", (s) => s.supabase.rpc("journal_unpublish", { p_article: str(fd, "articleId") }), "Unpublished. It is no longer on the public Journal; you can publish it again.");
}

export async function archiveAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const archive = str(fd, "archive") !== "0";
  return step(fd, "archive", (s) => s.supabase.rpc("journal_archive", { p_article: str(fd, "articleId"), p_archive: archive }), archive ? "Archived. It is off the public Journal and locked." : "Restored from the archive. It is not published.");
}

export async function deleteArticleAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const s = await staff();
  if (!s) return NOT_STAFF;
  const { error } = await s.supabase.rpc("journal_delete_article", { p_article: str(fd, "articleId") });
  if (error) return refused(error, "delete");
  refresh();
  redirect("/editorial?notice=deleted");
}

// ---------------------------------------------------------------- media --
export async function uploadImageAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const s = await staff();
  if (!s) return NOT_STAFF;
  const articleId = str(fd, "articleId");
  const alt = str(fd, "alt").trim();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { file: "Choose an image." } };
  if (!alt) return { fieldErrors: { alt: "Describe the image for people who can't see it." } };
  if (alt.length > 500) return { fieldErrors: { alt: "Keep the description under 500 characters." } };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = imageProblem(bytes);
  if (problem) return { fieldErrors: { file: problem } };
  const type = sniffImage(bytes)!;
  const stem = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}-${file.name.replace(/\.[^.]+$/, "")}`;
  const path = mediaPath(articleId, stem, type.ext);
  // The admin's own session uploads; storage RLS requires journal_can_edit.
  const up = await s.supabase.storage.from("journal-media").upload(path, bytes, { contentType: type.mime, upsert: false });
  if (up.error) {
    logWarn("journal_media_upload_failed", { reason: up.error.message });
    return { error: "The image couldn't be uploaded. Check you can edit this article and try again." };
  }
  const { data, error } = await s.supabase.rpc("journal_register_media", {
    p_article: articleId, p_path: path, p_mime: type.mime, p_bytes: bytes.byteLength, p_alt: alt, p_source_url: null,
  });
  if (error || !data) return refused(error ?? { message: "" }, "media");
  refresh(articleId);
  return { ok: true, notice: "Image added.", mediaId: data, mediaUrl: mediaUrl(data) };
}

// ----------------------------------------------------- people, taxonomy --
export async function setRoleAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const s = await staff();
  if (!s) return NOT_STAFF;
  if (!s.caps.isAdmin) return { error: "Only an administrator can change Journal roles." };
  const email = str(fd, "email").trim();
  const role = str(fd, "role");
  if (!email) return { fieldErrors: { email: "Enter the person's account email." } };
  if (role !== "writer" && role !== "reviewer" && role !== "editor") return { fieldErrors: { role: "Choose a role." } };
  const grant = str(fd, "grant") !== "0";
  const { data, error } = await s.supabase.rpc("journal_set_role", { p_email: email, p_role: role, p_grant: grant });
  if (error) return refused(error, "role");
  revalidatePath("/editorial/people");
  const messages: Record<string, string> = {
    granted: `Granted ${role}.`,
    revoked: `Removed ${role}.`,
    unchanged: "Nothing changed.",
    no_such_account: "No WLA account uses that email. They need to sign up first.",
  };
  return data === "no_such_account" ? { fieldErrors: { email: messages[data] } } : { ok: true, notice: messages[data ?? "unchanged"] };
}

const categorySchema = z.object({
  name: z.string().trim().min(1, "Name the category.").max(80),
  slug: z.string().trim(),
  description: z.string().trim().max(300),
  sort_order: z.coerce.number().int().min(0).max(999),
});

export async function saveCategoryAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const s = await staff();
  if (!s) return NOT_STAFF;
  if (!s.caps.isEditor) return { error: "Only an editor can change categories." };
  const parsed = categorySchema.safeParse({ name: str(fd, "name"), slug: str(fd, "slug"), description: str(fd, "description"), sort_order: str(fd, "sort_order") || "0" });
  if (!parsed.success) return { fieldErrors: { [String(parsed.error.issues[0].path[0])]: parsed.error.issues[0].message } };
  const slug = parsed.data.slug || slugify(parsed.data.name);
  const problem = slugProblem(slug);
  if (problem) return { fieldErrors: { slug: problem } };
  const id = str(fd, "id");
  const row = { name: parsed.data.name, slug, description: parsed.data.description || null, sort_order: parsed.data.sort_order };
  const { error } = id
    ? await s.supabase.from("journal_categories").update(row).eq("id", id)
    : await s.supabase.from("journal_categories").insert(row);
  if (error) {
    if (/duplicate key/i.test(error.message)) return { fieldErrors: { slug: "Another category already uses that slug." } };
    return refused(error, "category");
  }
  revalidatePath("/editorial/categories");
  revalidatePath("/journal", "layout");
  return { ok: true, notice: id ? "Category saved." : "Category added." };
}

export async function deleteCategoryAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  const s = await staff();
  if (!s) return NOT_STAFF;
  if (!s.caps.isEditor) return { error: "Only an editor can change categories." };
  const { error } = await s.supabase.from("journal_categories").delete().eq("id", str(fd, "id"));
  if (error) {
    if (/foreign key|violates/i.test(error.message)) return { error: "Articles still use this category. Move them first." };
    return refused(error, "category");
  }
  revalidatePath("/editorial/categories");
  return { ok: true, notice: "Category removed." };
}

// --------------------------------------------------------------- import --
export async function importMediumAction(_prev: JournalState, fd: FormData): Promise<JournalState> {
  let s;
  try {
    s = await requireJournalEditor();
  } catch (e) {
    if (e instanceof AccessError) return { error: "Only an editor can import." };
    throw e;
  }
  const uploads = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (uploads.length === 0) return { fieldErrors: { files: "Choose Medium's export zip, or one or more post .html files." } };
  const { MAX_ARCHIVE_BYTES, readExport } = await import("./medium");
  const total = uploads.reduce((n, f) => n + f.size, 0);
  if (total > MAX_ARCHIVE_BYTES) return { fieldErrors: { files: "The upload is larger than 50 MB. Import it in parts." } };
  const { files, problems } = readExport(await Promise.all(uploads.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
  if (files.length === 0) return { error: problems.join(" ") || "No posts were found to import." };

  const { runMediumImport } = await import("./importer");
  const supabase = s.supabase;
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
  }, { includeDrafts: str(fd, "includeDrafts") === "1", sourceName: uploads.map((f) => f.name).join(", ").slice(0, 200) });

  if (!report.runId) return { error: report.problems.join(" ") };
  refresh();
  redirect(`/editorial/import/${report.runId}`);
}
