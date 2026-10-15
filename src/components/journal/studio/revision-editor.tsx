"use client";

import { useActionState, useEffect, useId, useState } from "react";

import { useDirtyForm, useSubmitWithoutReset, useUnsavedChanges, UnsavedNote } from "@/components/admin/unsaved-changes";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import { saveRevisionAction, submitAction, type JournalState } from "@/features/journal/actions";
import { slugify } from "@/features/journal/content";
import { ActionButton } from "./action-button";
import { RichTextEditor, type MediaOption } from "./rich-text-editor";

export type EditableRevision = {
  id: string;
  number: number;
  lock_version: number;
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

const initial: JournalState = {};

const textarea =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";
const select =
  "min-h-[var(--target-min)] w-full rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";

/**
 * The working revision's content and metadata (D-128).
 *
 * Saving sends the lock version this form started from. If someone else has
 * saved since, nothing is overwritten: the author keeps their text and
 * chooses — keep theirs and reload, or keep mine and save over it knowingly.
 * Unsaved work is protected by the same guard as the Mission Builder (D-118).
 */
export function RevisionEditor({
  articleId,
  revision,
  categories,
  media,
}: {
  articleId: string;
  revision: EditableRevision;
  categories: { id: string; name: string }[];
  media: MediaOption[];
}) {
  const uid = useId();
  const [state, dispatch, pending] = useActionState(saveRevisionAction, initial);
  const [lock, setLock] = useState(revision.lock_version);
  const [body, setBody] = useState(revision.body_html);
  const [title, setTitle] = useState(revision.title);
  const [slug, setSlug] = useState(revision.slug);
  const [featured, setFeatured] = useState(revision.featured_media_id ?? "");
  const [excerpt, setExcerpt] = useState(revision.excerpt ?? "");
  const [seoDescription, setSeoDescription] = useState(revision.seo_description ?? "");
  const { ref, dirty, saved } = useDirtyForm("revision", `version ${revision.number} of this article`);
  const { setDirty } = useUnsavedChanges();
  const submit = useSubmitWithoutReset(dispatch);

  useEffect(() => {
    if (state.ok && state.lockVersion) {
      setLock(state.lockVersion); // eslint-disable-line react-hooks/set-state-in-effect -- adopt the server's new lock once per result
      saved();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps -- once per action result

  const fe = state.fieldErrors ?? {};
  const featuredAltDefault = revision.featured_alt ?? media.find((m) => m.id === featured)?.alt ?? "";

  return (
    <div>
      <form ref={ref} action={dispatch} onSubmit={submit} className="flex flex-col gap-[var(--space-l)]" aria-describedby={`${uid}-status`}>
        <input type="hidden" name="articleId" value={articleId} />
        <input type="hidden" name="revisionId" value={revision.id} />
        <input type="hidden" name="lockVersion" value={lock} />
        <input type="hidden" name="body_html" value={body} />

        {state.conflict && (
          <div role="alert" className="rounded-[var(--radius-input)] border border-[var(--color-error)] bg-[var(--color-surface)] p-[var(--space-m)]">
            <p className="font-medium">Someone else saved this version while you were editing.</p>
            <p className="mt-[var(--space-xs)] text-[length:var(--text-small)]">
              {state.conflict.by ?? "Another editor"} saved it at {new Date(state.conflict.at).toLocaleString("en-GB")}. Your text is still in the form below, unsaved.
            </p>
            <div className="mt-[var(--space-s)] flex flex-wrap gap-[var(--space-m)]">
              <a href={`/editorial/articles/${articleId}/preview?revision=${revision.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[var(--target-min)] items-center underline underline-offset-4">
                See their version (new tab)
              </a>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDirty("revision", null);
                  window.setTimeout(() => window.location.reload(), 50);
                }}
              >
                Discard mine and load theirs
              </Button>
              <Button type="button" variant="secondary" onClick={() => setLock(state.conflict!.lockVersion)}>
                Keep mine — I&rsquo;ll save over theirs
              </Button>
            </div>
            {lock === state.conflict.lockVersion && (
              <p className="mt-[var(--space-s)] text-[length:var(--text-small)]">Now press “Save” to replace their changes with yours.</p>
            )}
          </div>
        )}
        {!state.conflict && <FormError message={state.error} />}

        <Field label="Title" htmlFor={`${uid}-title`} error={fe.title}>
          <Input id={`${uid}-title`} name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required invalid={Boolean(fe.title)} />
        </Field>

        <Field label="URL slug" htmlFor={`${uid}-slug`} hint={`The article's address: /journal/${slug || "…"}`} error={fe.slug}>
          <div className="flex flex-wrap gap-[var(--space-s)]">
            <Input id={`${uid}-slug`} name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={120} className="flex-1 min-w-[12rem]" invalid={Boolean(fe.slug)} />
            <Button type="button" variant="secondary" onClick={() => setSlug(slugify(title))}>Suggest from title</Button>
          </div>
        </Field>

        <Field label="Excerpt" htmlFor={`${uid}-excerpt`} hint={`Shown on the Journal listing. ${excerpt.length}/600`} error={fe.excerpt}>
          <textarea id={`${uid}-excerpt`} name="excerpt" rows={3} maxLength={600} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} className={textarea} />
        </Field>

        <div className="flex flex-col gap-[var(--space-s)]">
          <span id={`${uid}-body-label`} className="text-[length:var(--text-label)] font-medium">Article</span>
          <RichTextEditor value={revision.body_html} onChange={setBody} labelId={`${uid}-body-label`} media={media} />
          {fe.body_html && <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">{fe.body_html}</p>}
        </div>

        <fieldset className="grid gap-[var(--space-l)] md:grid-cols-2">
          <legend className="mb-[var(--space-s)] text-[length:var(--text-h3)]">Details</legend>
          <Field label="Author shown on the article" htmlFor={`${uid}-author`} error={fe.author_name}>
            <Input id={`${uid}-author`} name="author_name" defaultValue={revision.author_name ?? ""} maxLength={120} />
          </Field>
          <Field label="Category" htmlFor={`${uid}-category`} error={fe.category_id}>
            <select id={`${uid}-category`} name="category_id" defaultValue={revision.category_id ?? ""} className={select}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Tags" htmlFor={`${uid}-tags`} hint="Separate tags with commas." error={fe.tags}>
            <Input id={`${uid}-tags`} name="tags" defaultValue={revision.tags.map((t) => t.replace(/-/g, " ")).join(", ")} />
          </Field>
          <Field label="Original publication date" htmlFor={`${uid}-date`} hint="For pieces first published elsewhere. Leave empty to use the date it goes live." error={fe.original_published_at}>
            {/* Chrome focuses a date input's inner segments, so the field itself never
                matches :focus — the global ring needs :focus-within here. */}
            <Input id={`${uid}-date`} name="original_published_at" type="date" defaultValue={revision.original_published_at?.slice(0, 10) ?? ""} className="focus-within:shadow-[var(--focus-ring)]" />
          </Field>
          <Field label="Featured image" htmlFor={`${uid}-featured`} hint={media.length ? undefined : "Upload an image under “Images” first."} error={fe.featured_media_id}>
            <select id={`${uid}-featured`} name="featured_media_id" value={featured} onChange={(e) => setFeatured(e.target.value)} className={select}>
              <option value="">None</option>
              {media.map((m) => <option key={m.id} value={m.id}>{m.alt || "Image without a description"}</option>)}
            </select>
          </Field>
          {featured && (
            <Field label="Featured image description (alt text)" htmlFor={`${uid}-alt`} error={fe.featured_alt}>
              <Input id={`${uid}-alt`} name="featured_alt" key={featured} defaultValue={featuredAltDefault} maxLength={500} invalid={Boolean(fe.featured_alt)} />
            </Field>
          )}
          {!featured && <input type="hidden" name="featured_alt" value="" />}
        </fieldset>

        <fieldset className="grid gap-[var(--space-l)] md:grid-cols-2">
          <legend className="mb-[var(--space-s)] text-[length:var(--text-h3)]">Search and sharing</legend>
          <Field label="Search title" htmlFor={`${uid}-seo-title`} hint="Leave empty to use the article title." error={fe.seo_title}>
            <Input id={`${uid}-seo-title`} name="seo_title" defaultValue={revision.seo_title ?? ""} maxLength={200} />
          </Field>
          <Field label="Search description" htmlFor={`${uid}-seo-desc`} hint={`Leave empty to use the excerpt. ${seoDescription.length}/320`} error={fe.seo_description}>
            <textarea id={`${uid}-seo-desc`} name="seo_description" rows={2} maxLength={320} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} className={textarea} />
          </Field>
          <Field label="Canonical URL" htmlFor={`${uid}-canonical`} hint="Only if the definitive copy lives elsewhere. Usually empty." error={fe.canonical_url}>
            <Input id={`${uid}-canonical`} name="canonical_url" type="url" defaultValue={revision.canonical_url ?? ""} placeholder="https://" invalid={Boolean(fe.canonical_url)} />
          </Field>
        </fieldset>

        <div className="sticky bottom-0 z-10 -mx-[var(--space-m)] flex flex-wrap items-center gap-[var(--space-m)] border-t border-[var(--color-border)] bg-[var(--color-background)] px-[var(--space-m)] py-[var(--space-s)]">
          <Button type="submit" isLoading={pending} loadingLabel="Saving…">Save</Button>
          <span id={`${uid}-status`}><UnsavedNote dirty={dirty} /></span>
          {!state.conflict && <FormNotice message={state.ok ? state.notice : undefined} />}
        </div>
      </form>

      <section aria-labelledby={`${uid}-submit`} className="mt-[var(--space-xl)] border-t border-[var(--color-border)] pt-[var(--space-l)]">
        <h3 id={`${uid}-submit`} className="text-[length:var(--text-h3)]">Want a second opinion? (optional)</h3>
        <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          You don&rsquo;t need a review to publish. Asking for one locks this version until a reviewer responds or you withdraw it; you can still publish it while it is in review.
        </p>
        <div className="mt-[var(--space-m)]">
          {dirty ? (
            <p className="text-[length:var(--text-small)]">Save your changes before asking for a review.</p>
          ) : (
            <ActionButton action={submitAction} fields={{ articleId, revisionId: revision.id, lockVersion: lock }} label="Ask for a review" pendingLabel="Submitting…" />
          )}
        </div>
      </section>
    </div>
  );
}
