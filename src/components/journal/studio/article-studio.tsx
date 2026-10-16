"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Dialog } from "@/components/admin/dialog";
import { useDirtyForm, useUnsavedChanges } from "@/components/admin/unsaved-changes";
import { Button } from "@/components/ui/button";
import { FormError, FormNotice } from "@/components/ui/field";
import {
  archiveAction,
  cancelScheduleAction,
  createPreviewLinkAction,
  deleteArticleAction,
  publishAction,
  registerUploadAction,
  revokePreviewLinkAction,
  saveRevisionAction,
  scheduleAction,
  unpublishAction,
  type JournalState,
} from "@/features/journal/actions";
import { mediaUrl, slugify } from "@/features/journal/content";
import { formatLondon, JOURNAL_TIME_ZONE, londonWallTimeToUtc } from "@/features/journal/time";
import { checkPickedImage, newUploadPath, prepareImage, uploadToStorage } from "@/features/journal/upload-client";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import { ActionButton } from "./action-button";
import { PeoplePanel } from "./side-panels";
import { RichTextEditor, type UploadImage } from "./rich-text-editor";

/**
 * THE ARTICLE STUDIO (D-137): one calm writing surface.
 *
 *   top bar   — where the article stands, in words, and every publishing
 *               action together: Save draft · Share · Publish…
 *   column    — toolbar, title, subtitle, author, then the article itself
 *   footer    — History · Comments · Settings, out of the way until needed
 *
 * Settings (URL, category, tags, featured image, search details, dates) live
 * in a side panel whose fields belong to the same form, so one Save keeps
 * everything. Publishing and scheduling happen in one dialog that saves
 * first if needed: an author never has to think about "save, then publish".
 * Every rule is still the database's (D-124, D-130).
 */

export type StudioRevision = {
  id: string;
  number: number;
  state: string;
  lock_version: number;
  content_hash: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body_html: string;
  author_name: string | null;
  category_id: string | null;
  tags: string[];
  featured_media_id: string | null;
  featured_alt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  original_published_at: string | null;
};

export type StudioProps = {
  articleId: string;
  revision: StudioRevision;
  /** Null when this person may edit now; otherwise why not, in words. */
  lockedReason: string | null;
  statusWords: string;
  live: { revisionId: string; number: number; slug: string; publicUrl: string | null; studioViewHref: string } | null;
  scheduled: { at: string; by: string } | null;
  scheduler: { configured: boolean; active: boolean; overdue: number } | null;
  canPublish: boolean;
  isEditor: boolean;
  archived: boolean;
  everPublished: boolean;
  publicSiteOrigin: string | null;
  categories: { id: string; name: string }[];
  media: { id: string; alt: string | null }[];
  previewLinks: { id: string; createdAt: string; expiresAt: string; by: string }[];
  people: { members: { id: string; name: string; role: "author" | "collaborator" }[]; writers: { id: string; name: string }[]; canManage: boolean };
  comments: ReactNode;
  commentCount: number;
  history: ReactNode;
};

const field =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";
const label = "text-[length:var(--text-label)] font-medium";
const hint = "text-[length:var(--text-small)] text-[var(--color-text-muted)]";
const quiet =
  "inline-flex min-h-[var(--target-min)] items-center gap-[var(--space-xs)] rounded-[var(--radius-control)] px-[var(--space-s)] text-[length:var(--text-small)] hover:bg-[var(--color-surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";

export function ArticleStudio(p: StudioProps) {
  const uid = useId();
  const formId = `${uid}-form`;
  const router = useRouter();
  const { setDirty } = useUnsavedChanges();
  const { ref: formRef, dirty, saved } = useDirtyForm("article", p.revision.title ? `“${p.revision.title}”` : "this article");

  const editable = p.lockedReason === null;
  const [revisionId, setRevisionId] = useState(p.revision.id);
  const [lock, setLock] = useState(p.revision.lock_version);
  const [contentHash, setContentHash] = useState(p.revision.content_hash);
  const [title, setTitle] = useState(p.revision.title);
  const [body, setBody] = useState(p.revision.body_html);
  const [slug, setSlug] = useState(p.revision.slug);
  // A new article's URL follows its title until someone sets it by hand.
  const [slugFollows, setSlugFollows] = useState(!p.everPublished && (p.revision.slug === "" || p.revision.slug === slugify(p.revision.title)));
  const [featured, setFeatured] = useState(p.revision.featured_media_id ?? "");
  const [featuredAlt, setFeaturedAlt] = useState(p.revision.featured_alt ?? "");
  const [media, setMedia] = useState(p.media);
  const [pending, setPending] = useState(0);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<JournalState>({});
  const [panel, setPanel] = useState<null | "settings" | "history" | "comments">(null);
  const [dialog, setDialog] = useState<null | "publish" | "share">(null);
  const resolver = useRef<((r: JournalState) => void) | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The toolbar sticks below the app header and this bar, whatever their height.
  useEffect(() => {
    const el = barRef.current;
    const root = rootRef.current;
    if (!el || !root) return;
    const set = () => root.style.setProperty("--studio-bar-height", `${64 + el.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const key = (e: KeyboardEvent) => { if (e.key === "Tab") root.dataset.focusSource = "keyboard"; };
    const pointer = () => { root.dataset.focusSource = "pointer"; };
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", pointer, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("pointerdown", pointer, true);
      delete root.dataset.focusSource;
    };
  }, []);

  useEffect(() => {
    if (slugFollows) setSlug(slugify(title)); // eslint-disable-line react-hooks/set-state-in-effect -- derived default, overridable
  }, [title, slugFollows]);

  // ------------------------------------------------------------ saving --
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const done = resolver.current;
    resolver.current = null;
    if (pending > 0) {
      const r = { error: pending === 1 ? "An image is still uploading (or failed). Wait for it, or remove it, then save." : `${pending} images are still uploading (or failed). Wait for them, or remove them, then save.` };
      setResult(r);
      done?.(r);
      return;
    }
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    let r: JournalState;
    try {
      r = await saveRevisionAction({}, fd);
    } catch {
      r = { error: "That didn't save — the connection dropped. Your text is still here; try again." };
    }
    setSaving(false);
    setResult(r);
    if (r.ok) {
      if (r.lockVersion) setLock(r.lockVersion);
      if (r.revisionId) setRevisionId(r.revisionId);
      if (r.contentHash) setContentHash(r.contentHash);
      saved();
      router.refresh();
    }
    done?.(r);
  };

  /** Save through the form (so unsaved-change tracking sees it) and wait. */
  const saveNow = useCallback(
    () =>
      new Promise<JournalState>((resolve) => {
        if (!formRef.current) return resolve({ error: "The editor isn't ready." });
        resolver.current = resolve;
        formRef.current.requestSubmit();
      }),
    [formRef],
  );

  // ----------------------------------------------------------- uploads --
  const uploadImage: UploadImage = useCallback(
    async (file, onProgress) => {
      const checked = await checkPickedImage(file);
      if ("error" in checked) return checked;
      const prepared = await prepareImage(file, checked.type);
      if ("error" in prepared) return prepared;
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) return { error: "Your session has expired. Reload the page, sign in, and try again." };
      const path = newUploadPath(p.articleId, file.name, prepared.type.ext);
      try {
        await uploadToStorage({
          supabaseUrl: publicEnv.supabaseUrl,
          anonKey: publicEnv.supabaseAnonKey,
          accessToken: token,
          path,
          blob: prepared.blob,
          contentType: prepared.type.mime,
          onProgress: (f) => onProgress(f * 0.9),
        });
      } catch (e) {
        return { error: e instanceof Error ? e.message : "The image couldn't be uploaded. Try again." };
      }
      const fd = new FormData();
      fd.set("articleId", p.articleId);
      fd.set("path", path);
      const r = await registerUploadAction({}, fd).catch(() => ({ error: "The image couldn't be saved. Try again." }) as JournalState);
      if (!r.ok || !r.mediaId || !r.mediaUrl) return { error: r.error ?? "The image couldn't be saved. Try again." };
      onProgress(1);
      setMedia((m) => [{ id: r.mediaId!, alt: null }, ...m]);
      return { mediaId: r.mediaId, src: r.mediaUrl };
    },
    [p.articleId],
  );

  const onPendingUploads = useCallback((n: number) => setPending(n), []);

  // While uploading, leaving the page would lose the image.
  useEffect(() => {
    setDirty("uploads", pending > 0 ? "images that are still uploading" : null);
  }, [pending, setDirty]);

  const saveWords = saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved";
  const hasNewVersion = Boolean(p.live && (revisionId !== p.live.revisionId || dirty));

  return (
    <div ref={rootRef} className="pb-[var(--space-3xl)]">
      {/* The page's heading: the title field below is an input, not a heading. */}
      <h1 className="sr-only">{title.trim() || "Untitled draft"} — Journal studio</h1>
      {/* ------------------------------------------------------------ top bar */}
      <div ref={barRef} className="sticky top-[64px] z-30 border-b border-[var(--color-border)] bg-[var(--color-background)]">
        <div className="flex flex-wrap items-center gap-x-[var(--space-m)] gap-y-[var(--space-xs)] px-[var(--space-m)] py-[var(--space-xs)] lg:px-[var(--space-l)]">
          <Link href="/editorial" className={quiet}>
            <span aria-hidden="true">←</span> Articles
          </Link>
          <p className="flex flex-wrap items-center gap-[var(--space-s)] text-[length:var(--text-small)]" role="status" aria-live="polite">
            <span className="rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-[var(--space-xs)] py-[2px] font-medium">
              {p.statusWords}
              {p.live && dirty && !p.statusWords.includes("unpublished") ? " · unpublished changes" : ""}
            </span>
            {editable && <span className="text-[var(--color-text-muted)]">{saveWords}</span>}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-[var(--space-s)]">
            {editable && (
              <Button type="submit" form={formId} variant="secondary" isLoading={saving} loadingLabel="Saving…">
                Save draft
              </Button>
            )}
            {editable && (
              <Button type="button" variant="secondary" onClick={() => setDialog("share")}>
                Share
              </Button>
            )}
            {p.canPublish && editable && (
              <Button type="button" onClick={() => setDialog("publish")}>
                {p.live ? "Publish update…" : "Publish…"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[46rem] px-[var(--space-m)] pt-[var(--space-m)] md:px-[var(--space-xl)]">
        {p.scheduled && (
          <div role="note" className="mb-[var(--space-m)] rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface-sage)] p-[var(--space-m)]">
            <p>
              <strong>Scheduled</strong> to publish automatically on {formatLondon(p.scheduled.at)} (set by {p.scheduled.by}). It&rsquo;s locked until then.
            </p>
            {p.canPublish && (
              <div className="mt-[var(--space-s)]">
                <ActionButton action={cancelScheduleAction} fields={{ articleId: p.articleId }} label="Cancel the schedule to make changes" />
              </div>
            )}
          </div>
        )}
        {p.lockedReason && !p.scheduled && (
          <p role="note" className="mb-[var(--space-m)] rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-[var(--space-m)]">
            {p.lockedReason}
          </p>
        )}
        {p.live && (
          <p className={`mb-[var(--space-m)] ${hint}`}>
            {hasNewVersion ? "Readers still see the published version until you publish your changes. " : "This is the published version. "}
            {p.live.publicUrl ? (
              <a href={p.live.publicUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">View it on the public Journal (new tab)</a>
            ) : (
              <Link href={p.live.studioViewHref} className="underline underline-offset-4">Read the published version</Link>
            )}
          </p>
        )}
        {result.conflict && (
          <div role="alert" className="mb-[var(--space-m)] rounded-[var(--radius-input)] border border-[var(--color-error)] bg-[var(--color-surface)] p-[var(--space-m)]">
            <p className="font-medium">Someone else saved this article while you were editing.</p>
            <p className="mt-[var(--space-xs)] text-[length:var(--text-small)]">
              {result.conflict.by ?? "Another editor"} saved it at {new Date(result.conflict.at).toLocaleString("en-GB")}. Your text is still here, unsaved.
            </p>
            <div className="mt-[var(--space-s)] flex flex-wrap gap-[var(--space-m)]">
              <Button type="button" variant="secondary" onClick={() => { setDirty("article", null); window.setTimeout(() => window.location.reload(), 50); }}>
                Discard mine and load theirs
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setLock(result.conflict!.lockVersion); setResult({ notice: "Now press “Save draft” to replace their changes with yours." }); }}>
                Keep mine — I&rsquo;ll save over theirs
              </Button>
            </div>
          </div>
        )}
        {!result.conflict && <div className="mb-[var(--space-s)]"><FormError message={result.error ?? Object.values(result.fieldErrors ?? {})[0]} /></div>}
        {!result.conflict && result.ok && result.startedNewVersion && <div className="mb-[var(--space-s)]"><FormNotice message={result.notice} /></div>}

        {/* ------------------------------------------------------- the article */}
        <form id={formId} ref={formRef} onSubmit={onSubmit}>
          <input type="hidden" name="articleId" value={p.articleId} />
          <input type="hidden" name="revisionId" value={revisionId} data-dirty-ignore="" />
          <input type="hidden" name="lockVersion" value={lock} data-dirty-ignore="" />
          <input type="hidden" name="body_html" value={body} />
          <span id={`${uid}-body`} className="sr-only">Article text</span>
          <RichTextEditor
            value={p.revision.body_html}
            onChange={setBody}
            labelId={`${uid}-body`}
            uploadImage={uploadImage}
            onPendingUploads={onPendingUploads}
            readOnly={!editable}
            header={
              <div className="mb-[var(--space-l)] flex flex-col gap-[var(--space-s)]">
                <label htmlFor={`${uid}-title`} className="sr-only">Title</label>
                <AutoTextarea
                  id={`${uid}-title`}
                  name="title"
                  value={title}
                  onChange={setTitle}
                  placeholder="Title"
                  maxLength={200}
                  readOnly={!editable}
                  className="wla-display font-[family-name:var(--font-serif)]"
                />
                {result.fieldErrors?.title && <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">{result.fieldErrors.title}</p>}
                <label htmlFor={`${uid}-sub`} className="sr-only">Subtitle — also shown on the Journal listing</label>
                <AutoTextarea
                  id={`${uid}-sub`}
                  name="excerpt"
                  defaultValue={p.revision.excerpt ?? ""}
                  placeholder="Add a subtitle…"
                  maxLength={600}
                  readOnly={!editable}
                  className="font-[family-name:var(--font-serif)] text-[length:var(--text-body-lg)] italic text-[var(--color-text-muted)]"
                />
                <div className="flex items-center gap-[var(--space-xs)] text-[length:var(--text-small)]">
                  <label htmlFor={`${uid}-author`} className="text-[var(--color-text-muted)]">By</label>
                  <input
                    id={`${uid}-author`}
                    name="author_name"
                    defaultValue={p.revision.author_name ?? ""}
                    placeholder="Author name"
                    maxLength={120}
                    readOnly={!editable}
                    className="journal-writing min-h-[var(--target-min)] w-[16rem] max-w-full rounded-[var(--radius-control)] border border-transparent bg-transparent px-[var(--space-xs)] hover:border-[var(--color-border)]"
                  />
                </div>
              </div>
            }
          />
        </form>
      </div>

      {/* ------------------------------------------------------------ footer */}
      <div className="sticky bottom-0 z-20 mt-[var(--space-l)] border-t border-[var(--color-border)] bg-[var(--color-background)]">
        <div className="flex flex-wrap items-center gap-[var(--space-s)] px-[var(--space-m)] py-[var(--space-xs)] lg:px-[var(--space-l)]">
          <button type="button" className={quiet} aria-expanded={panel === "history"} onClick={() => setPanel(panel === "history" ? null : "history")}>History</button>
          <button type="button" className={quiet} aria-expanded={panel === "comments"} onClick={() => setPanel(panel === "comments" ? null : "comments")}>
            Comments{p.commentCount ? ` (${p.commentCount})` : ""}
          </button>
          <button type="button" className={`${quiet} ml-auto`} aria-expanded={panel === "settings"} onClick={() => setPanel(panel === "settings" ? null : "settings")}>
            <span aria-hidden="true">⚙</span> Settings
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------- settings */}
      <Panel open={panel === "settings"} onClose={() => setPanel(null)} title="Article settings">
        <fieldset disabled={!editable} className="flex flex-col gap-[var(--space-l)]">
          <div className="flex flex-col gap-[var(--space-xs)]">
            <label htmlFor={`${uid}-slug`} className={label}>Web address</label>
            <input
              id={`${uid}-slug`}
              form={formId}
              name="slug"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugFollows(false); }}
              maxLength={120}
              className={`${field} min-h-[var(--target-min)]`}
              aria-describedby={`${uid}-slug-h`}
            />
            <p id={`${uid}-slug-h`} className={hint}>
              {webAddress(p.publicSiteOrigin, slug)}
              {slugFollows ? " — follows the title until you change it." : ""}
            </p>
            {!slugFollows && (
              <button type="button" className={`${quiet} self-start underline`} onClick={() => { setSlugFollows(true); }}>Make it from the title</button>
            )}
            {result.fieldErrors?.slug && <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">{result.fieldErrors.slug}</p>}
          </div>

          <div className="flex flex-col gap-[var(--space-xs)]">
            <label htmlFor={`${uid}-cat`} className={label}>Category</label>
            <select id={`${uid}-cat`} form={formId} name="category_id" defaultValue={p.revision.category_id ?? ""} className={`${field} min-h-[var(--target-min)]`}>
              <option value="">No category</option>
              {p.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-[var(--space-xs)]">
            <label htmlFor={`${uid}-tags`} className={label}>Tags</label>
            <input id={`${uid}-tags`} form={formId} name="tags" defaultValue={p.revision.tags.map((t) => t.replace(/-/g, " ")).join(", ")} className={`${field} min-h-[var(--target-min)]`} aria-describedby={`${uid}-tags-h`} />
            <p id={`${uid}-tags-h`} className={hint}>Separate tags with commas.</p>
          </div>

          <FeaturedImage
            uid={uid}
            formId={formId}
            media={media}
            featured={featured}
            setFeatured={setFeatured}
            alt={featuredAlt}
            setAlt={setFeaturedAlt}
            uploadImage={uploadImage}
            error={result.fieldErrors?.featured_alt}
          />

          <div className="flex flex-col gap-[var(--space-xs)]">
            <label htmlFor={`${uid}-date`} className={label}>First published (if elsewhere)</label>
            <input id={`${uid}-date`} form={formId} name="original_published_at" type="date" defaultValue={p.revision.original_published_at?.slice(0, 10) ?? ""} className={`${field} min-h-[var(--target-min)] focus-within:shadow-[var(--focus-ring)]`} aria-describedby={`${uid}-date-h`} />
            <p id={`${uid}-date-h`} className={hint}>Leave empty to use the date it goes live here.</p>
          </div>

          <details className="rounded-[var(--radius-input)] border border-[var(--color-border)] p-[var(--space-s)]">
            <summary className="min-h-[var(--target-min)] cursor-pointer py-[var(--space-xs)] font-medium">Search and sharing (optional)</summary>
            <div className="mt-[var(--space-s)] flex flex-col gap-[var(--space-m)]">
              <div className="flex flex-col gap-[var(--space-xs)]">
                <label htmlFor={`${uid}-seot`} className={label}>Search title</label>
                <input id={`${uid}-seot`} form={formId} name="seo_title" defaultValue={p.revision.seo_title ?? ""} maxLength={200} className={`${field} min-h-[var(--target-min)]`} placeholder="Leave empty to use the title" />
              </div>
              <div className="flex flex-col gap-[var(--space-xs)]">
                <label htmlFor={`${uid}-seod`} className={label}>Search description</label>
                <textarea id={`${uid}-seod`} form={formId} name="seo_description" defaultValue={p.revision.seo_description ?? ""} maxLength={320} rows={3} className={`${field} py-[var(--space-xs)]`} placeholder="Leave empty to use the subtitle" />
              </div>
              <div className="flex flex-col gap-[var(--space-xs)]">
                <label htmlFor={`${uid}-canon`} className={label}>Canonical address</label>
                <input id={`${uid}-canon`} form={formId} name="canonical_url" type="url" defaultValue={p.revision.canonical_url ?? ""} placeholder="https://" className={`${field} min-h-[var(--target-min)]`} aria-describedby={`${uid}-canon-h`} />
                <p id={`${uid}-canon-h`} className={hint}>Only if the definitive copy lives on another site. Usually empty.</p>
                {result.fieldErrors?.canonical_url && <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">{result.fieldErrors.canonical_url}</p>}
              </div>
            </div>
          </details>
        </fieldset>

        {editable && (
          <div className="mt-[var(--space-m)]">
            <Button type="submit" form={formId} variant="secondary" isLoading={saving} loadingLabel="Saving…">Save draft</Button>
          </div>
        )}

        <ArticleActions {...p} />
      </Panel>

      <Panel open={panel === "history"} onClose={() => setPanel(null)} title="History">{p.history}</Panel>
      <Panel open={panel === "comments"} onClose={() => setPanel(null)} title="Comments">{p.comments}</Panel>

      {/* ------------------------------------------------------------ dialogs */}
      <PublishDialog
        open={dialog === "publish"}
        onClose={() => setDialog(null)}
        p={p}
        dirty={dirty}
        title={title}
        body={body}
        slug={slug}
        pendingUploads={pending}
        revisionId={revisionId}
        contentHash={contentHash}
        saveNow={saveNow}
        onDone={() => { setDialog(null); router.refresh(); }}
      />
      <ShareDialog open={dialog === "share"} onClose={() => setDialog(null)} p={p} dirty={dirty} saveNow={saveNow} saving={saving} />
    </div>
  );
}

// ---------------------------------------------------------------- pieces --
/** Where readers will find it, in words. */
function webAddress(origin: string | null, slug: string): string {
  const path = `/journal/${slug || "…"}`;
  return origin ? `${origin}${path}` : `${path} on the public website`;
}

function AutoTextarea({
  id, name, value, defaultValue, onChange, placeholder, maxLength, readOnly, className,
}: {
  id: string; name: string; value?: string; defaultValue?: string; onChange?: (v: string) => void;
  placeholder: string; maxLength: number; readOnly?: boolean; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(fit);
  return (
    <textarea
      ref={ref}
      id={id}
      name={name}
      rows={1}
      value={value}
      defaultValue={defaultValue}
      onChange={(e) => { onChange?.(e.target.value); fit(); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
      placeholder={placeholder}
      maxLength={maxLength}
      readOnly={readOnly}
      className={`journal-writing w-full resize-none overflow-hidden border-0 bg-transparent p-0 placeholder:text-[var(--color-text-muted)] rounded-[var(--radius-control)] ${className ?? ""}`}
    />
  );
}

/**
 * A side panel that stays MOUNTED when closed (`hidden`), so the settings
 * fields inside it keep their values and are submitted with the article.
 */
function Panel({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const h = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement;
      headingRef.current?.focus();
    } else if (opener.current instanceof HTMLElement) {
      opener.current.focus();
      opener.current = null;
    }
  }, [open]);
  return (
    <aside
      hidden={!open}
      aria-labelledby={h}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      className="fixed inset-y-0 right-0 z-40 w-[min(28rem,100vw)] overflow-y-auto border-l border-[var(--color-border-strong)] bg-[var(--color-background)] p-[var(--space-l)] shadow-[var(--shadow-overlay)]"
    >
      <div className="mb-[var(--space-l)] flex items-center justify-between gap-[var(--space-m)]">
        <h2 id={h} ref={headingRef} tabIndex={-1} className="text-[length:var(--text-h3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">{title}</h2>
        <button type="button" onClick={onClose} className={quiet} aria-label={`Close ${title.toLowerCase()}`}>
          <span aria-hidden="true">✕</span> Close
        </button>
      </div>
      {children}
    </aside>
  );
}

function FeaturedImage({
  uid, formId, media, featured, setFeatured, alt, setAlt, uploadImage, error,
}: {
  uid: string; formId: string; media: { id: string; alt: string | null }[]; featured: string;
  setFeatured: (v: string) => void; alt: string; setAlt: (v: string) => void; uploadImage: UploadImage; error?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ progress: number; error?: string } | null>(null);
  return (
    <fieldset className="flex flex-col gap-[var(--space-s)]">
      <legend className={`${label} mb-[var(--space-xs)]`}>Featured image</legend>
      <p className={hint}>Shown at the top of the article and when it&rsquo;s shared.</p>
      <input type="hidden" form={formId} name="featured_media_id" value={featured} />
      <ul className="grid grid-cols-3 gap-[var(--space-s)]">
        <li>
          <button type="button" aria-pressed={featured === ""} onClick={() => setFeatured("")} className={`flex aspect-[4/3] w-full items-center justify-center rounded-[var(--radius-control)] border text-[length:var(--text-small)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] ${featured === "" ? "border-[var(--color-text)] font-semibold underline" : "border-[var(--color-border)]"}`}>
            None
          </button>
        </li>
        {media.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              aria-pressed={featured === m.id}
              aria-label={`Use ${m.alt || "this image"} as the featured image`}
              onClick={() => { setFeatured(m.id); if (!alt && m.alt) setAlt(m.alt); }}
              className={`block w-full overflow-hidden rounded-[var(--radius-control)] border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] ${featured === m.id ? "border-[var(--color-text)]" : "border-transparent"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(m.id)} alt="" className="aspect-[4/3] w-full object-cover" />
              {featured === m.id && <span className="block bg-[var(--color-surface-raised)] text-[length:var(--text-small)] font-semibold">Chosen</span>}
            </button>
          </li>
        ))}
      </ul>
      <div>
        <button type="button" className={`${quiet} border border-[var(--color-border-strong)]`} onClick={() => fileRef.current?.click()}>
          Upload a new image
        </button>
        <input
          ref={fileRef}
          type="file"
            hidden
            aria-label="Choose a file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          tabIndex={-1}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setUpload({ progress: 0 });
            const r = await uploadImage(f, (x) => setUpload({ progress: x }));
            if ("error" in r) setUpload({ progress: 0, error: r.error });
            else { setUpload(null); setFeatured(r.mediaId); }
          }}
        />
        {upload && !upload.error && <p role="status" className={hint}>Uploading — {Math.round(upload.progress * 100)}%</p>}
        {upload?.error && <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">{upload.error}</p>}
      </div>
      {featured && (
        <div className="flex flex-col gap-[var(--space-xs)]">
          <label htmlFor={`${uid}-falt`} className={label}>Featured image description</label>
          <input id={`${uid}-falt`} form={formId} name="featured_alt" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={500} className={`${field} min-h-[var(--target-min)]`} aria-invalid={error ? true : undefined} />
          {error && <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">{error}</p>}
        </div>
      )}
      {!featured && <input type="hidden" form={formId} name="featured_alt" value="" />}
    </fieldset>
  );
}

/** Unpublish, archive, delete — consequential, so out of the writing flow. */
function ArticleActions(p: StudioProps) {
  const anything = (p.live && p.canPublish) || p.isEditor;
  if (!anything) return null;
  return (
    <section className="mt-[var(--space-2xl)] border-t border-[var(--color-border)] pt-[var(--space-l)]">
      <h3 className="text-[length:var(--text-h3)]">This article</h3>
      <div className="mt-[var(--space-m)] flex flex-col gap-[var(--space-m)]">
        {p.live && p.canPublish && !p.archived && (
          <ActionButton
            action={unpublishAction}
            fields={{ articleId: p.articleId }}
            label="Unpublish"
            confirm={{ title: "Unpublish this article?", body: <p>It disappears from the public Journal straight away. Nothing is deleted, and you can publish it again.</p>, confirmLabel: "Unpublish", destructive: true }}
          />
        )}
        {p.isEditor && (
          <ActionButton
            action={archiveAction}
            fields={{ articleId: p.articleId, archive: p.archived ? 0 : 1 }}
            label={p.archived ? "Restore from the archive" : "Archive"}
            confirm={p.archived ? undefined : { title: "Archive this article?", body: <p>It disappears from the public Journal straight away, any schedule is cancelled, and it can&rsquo;t be edited until it is restored. Nothing is deleted.</p>, confirmLabel: "Archive", destructive: true }}
          />
        )}
        {p.isEditor && !p.everPublished && !p.archived && (
          <ActionButton
            action={deleteArticleAction}
            fields={{ articleId: p.articleId }}
            label="Delete this draft"
            variant="text"
            confirm={{ title: "Delete this draft for good?", body: <p>Every version and comment is removed. The record that it was deleted is kept. This can&rsquo;t be undone.</p>, confirmLabel: "Delete", destructive: true }}
          />
        )}
      </div>
    </section>
  );
}

// ----------------------------------------------------------- publishing --
function PublishDialog({
  open, onClose, p, dirty, title, body, slug, pendingUploads, revisionId, contentHash, saveNow, onDone,
}: {
  open: boolean; onClose: () => void; p: StudioProps; dirty: boolean; title: string; body: string; slug: string;
  pendingUploads: number; revisionId: string; contentHash: string; saveNow: () => Promise<JournalState>; onDone: () => void;
}) {
  const uid = useId();
  const [when, setWhen] = useState<"now" | "later">("now");
  const [local, setLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const preview = local ? londonWallTimeToUtc(local) : null;

  const text = body.replace(/<[^>]*>/g, "").trim();
  const imagesWithoutAlt = (body.match(/<img\b[^>]*>/g) ?? []).filter((t) => !/\salt="[^"]+"/.test(t)).length;
  const nothingNew = Boolean(p.live && !dirty && revisionId === p.live.revisionId);
  const problems = [
    !title.trim() && "Give it a title.",
    !text && !/<img\b/.test(body) && "Write something first — the article is empty.",
    !slug && "It needs a web address (Settings).",
    pendingUploads > 0 && "Wait for images to finish uploading, or remove any that failed.",
  ].filter(Boolean) as string[];

  const go = async () => {
    setError(undefined);
    if (when === "later" && !preview?.ok) {
      setError(preview && !preview.ok && preview.reason === "nonexistent" ? "That time doesn't exist in the UK (the clocks go forward). Choose another." : "Choose a date and time.");
      return;
    }
    setBusy(true);
    let rev = revisionId;
    let hash = contentHash;
    if (dirty) {
      const s = await saveNow();
      if (!s.ok) { setBusy(false); setError(s.error ?? Object.values(s.fieldErrors ?? {})[0] ?? "Saving failed, so nothing was published."); return; }
      rev = s.revisionId ?? rev;
      hash = s.contentHash ?? hash;
    }
    const fd = new FormData();
    fd.set("articleId", p.articleId);
    fd.set("revisionId", rev);
    fd.set("contentHash", hash);
    if (when === "later") fd.set("atLocal", local);
    const r = await (when === "now" ? publishAction({}, fd) : scheduleAction({}, fd)).catch(() => ({ error: "The connection dropped, so nothing changed. Try again." }) as JournalState);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? Object.values(r.fieldErrors ?? {})[0]); return; }
    onDone();
  };

  const healthy = !p.scheduler || (p.scheduler.configured && p.scheduler.active && p.scheduler.overdue === 0);
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title={p.live ? "Publish your changes" : "Publish this article"} role="alertdialog">
      <div className="flex flex-col gap-[var(--space-m)]">
        <div className="rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)]">
          <p className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">{title || "Untitled"}</p>
          <p className={`mt-[var(--space-xs)] ${hint}`}>{webAddress(p.publicSiteOrigin, slug)}</p>
        </div>

        {nothingNew ? (
          <p>This version is already published. Make a change and save it to publish an update.</p>
        ) : problems.length > 0 ? (
          <div role="alert">
            <p className="font-medium">Before it can be published:</p>
            <ul className="mt-[var(--space-xs)] list-disc pl-[var(--space-l)]">{problems.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ) : (
          <>
            <fieldset className="flex flex-col gap-[var(--space-xs)]">
              <legend className={`${label} mb-[var(--space-xs)]`}>When</legend>
              <label className="flex min-h-[var(--target-min)] items-center gap-[var(--space-s)]">
                <input type="radio" name={`${uid}-when`} checked={when === "now"} onChange={() => setWhen("now")} className="h-5 w-5 accent-[var(--color-primary)]" />
                Now
              </label>
              <label className="flex min-h-[var(--target-min)] items-center gap-[var(--space-s)]">
                <input type="radio" name={`${uid}-when`} checked={when === "later"} onChange={() => setWhen("later")} className="h-5 w-5 accent-[var(--color-primary)]" />
                At a later time
              </label>
            </fieldset>
            {when === "later" && (
              <div className="flex flex-col gap-[var(--space-xs)]">
                <label htmlFor={`${uid}-at`} className={label}>Date and time — UK time ({JOURNAL_TIME_ZONE})</label>
                <input
                  id={`${uid}-at`}
                  type="datetime-local"
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                  aria-describedby={`${uid}-at-h ${uid}-at-p`}
                  className={`${field} min-h-[var(--target-min)] max-w-[18rem] focus-within:shadow-[var(--focus-ring)]`}
                />
                <p id={`${uid}-at-h`} className={hint}>Always UK time, whatever your device says. It publishes by itself at that moment — nobody needs to be online.</p>
                <p id={`${uid}-at-p`} role="status" className="text-[length:var(--text-small)]">
                  {preview?.ok ? `= ${formatLondon(preview.utc)}${preview.ambiguous ? " — the first of the two 01:00 hours as the clocks go back" : ""}` : ""}
                </p>
                {!healthy && (
                  <p role="alert" className="rounded-[var(--radius-input)] border border-[var(--color-error)] p-[var(--space-s)] text-[length:var(--text-small)]">
                    Automatic publishing isn&rsquo;t running right now, so a scheduled article may not publish on time.
                  </p>
                )}
              </div>
            )}
            {imagesWithoutAlt > 0 && (
              <p className="rounded-[var(--radius-input)] border border-[var(--color-border-strong)] p-[var(--space-s)] text-[length:var(--text-small)]">
                {imagesWithoutAlt === 1 ? "One image has" : `${imagesWithoutAlt} images have`} no description for people who can&rsquo;t see it. You can still publish; select an image to add one.
              </p>
            )}
            <p className={hint}>
              {dirty ? "Your unsaved changes are saved first. " : ""}
              {p.live ? "It replaces the published version; readers see the new one straight away." : "It appears on the public Journal."}
            </p>
          </>
        )}

        <FormError message={error} />
        <div className="flex flex-wrap gap-[var(--space-m)]">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          {!nothingNew && problems.length === 0 && (
            <Button type="button" onClick={go} isLoading={busy} loadingLabel={when === "now" ? "Publishing…" : "Scheduling…"}>
              {when === "now" ? (p.live ? "Publish update now" : "Publish now") : "Schedule"}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// --------------------------------------------------------------- sharing --
function ShareDialog({ open, onClose, p, dirty, saveNow, saving }: { open: boolean; onClose: () => void; p: StudioProps; dirty: boolean; saveNow: () => Promise<JournalState>; saving: boolean }) {
  const uid = useId();
  const [made, setMade] = useState<JournalState>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const create = async () => {
    setBusy(true);
    setCopied(false);
    const fd = new FormData();
    fd.set("articleId", p.articleId);
    const r = await createPreviewLinkAction({}, fd).catch(() => ({ error: "The connection dropped. Try again." }) as JournalState);
    setBusy(false);
    setMade(r);
  };
  return (
    <Dialog open={open} onClose={onClose} title="Share a preview">
      <div className="flex flex-col gap-[var(--space-l)]">
        <section aria-labelledby={`${uid}-v`}>
          <h3 id={`${uid}-v`} className="text-[length:var(--text-label)] font-semibold">Anyone with the link can read it</h3>
          <p className={`mt-[var(--space-xs)] ${hint}`}>
            View only. The link shows the latest <strong>saved</strong> version; they can&rsquo;t edit it, and it doesn&rsquo;t appear on the public Journal. Links work for 30 days unless you turn them off.
          </p>
          {dirty && (
            <p className="mt-[var(--space-s)] text-[length:var(--text-small)]">
              You have unsaved changes, which the link won&rsquo;t show yet.{" "}
              <Button type="button" variant="text" onClick={() => void saveNow()} isLoading={saving} loadingLabel="Saving…">Save draft now</Button>
            </p>
          )}
          {made.previewUrl ? (
            <div className="mt-[var(--space-s)] flex flex-col gap-[var(--space-xs)]">
              <label htmlFor={`${uid}-url`} className={label}>Your preview link</label>
              <div className="flex flex-wrap gap-[var(--space-s)]">
                <input id={`${uid}-url`} readOnly value={made.previewUrl} onFocus={(e) => e.currentTarget.select()} className={`${field} min-h-[var(--target-min)] flex-1 min-w-[12rem] font-mono text-[length:var(--text-small)]`} />
                <Button type="button" variant="secondary" onClick={async () => { await navigator.clipboard?.writeText(made.previewUrl!); setCopied(true); }}>
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              <p className={hint} role="status">{copied ? "Copied. " : ""}Copy it now — for safety the full link is shown only once. If you lose it, make a new one.</p>
            </div>
          ) : (
            <div className="mt-[var(--space-s)]">
              <Button type="button" variant="secondary" onClick={create} isLoading={busy} loadingLabel="Creating…">Create a preview link</Button>
            </div>
          )}
          <FormError message={made.error} />
          {p.previewLinks.length > 0 && (
            <div className="mt-[var(--space-m)]">
              <h4 className="text-[length:var(--text-small)] font-semibold">Links that work now</h4>
              <ul className="mt-[var(--space-xs)] flex flex-col gap-[var(--space-s)]">
                {p.previewLinks.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-[var(--space-s)] text-[length:var(--text-small)]">
                    <span>Made by {l.by}, {formatLondon(l.createdAt)} · until {formatLondon(l.expiresAt)}</span>
                    <ActionButton action={revokePreviewLinkAction} fields={{ articleId: p.articleId, linkId: l.id }} label="Turn off" variant="text" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby={`${uid}-e`} className="border-t border-[var(--color-border)] pt-[var(--space-m)]">
          <h3 id={`${uid}-e`} className="sr-only">People who can edit</h3>
          <PeoplePanel articleId={p.articleId} members={p.people.members} writers={p.people.writers} canManage={p.people.canManage} />
          <p className={`mt-[var(--space-xs)] ${hint}`}>Editing needs a Journal account. A preview link never lets anyone edit.</p>
        </section>

        <div>
          <Button type="button" variant="secondary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}
