"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import { addCommentAction, resolveCommentAction, setMemberAction, uploadImageAction, type JournalState } from "@/features/journal/actions";
import { mediaUrl } from "@/features/journal/content";
import { ActionButton } from "./action-button";

const h3 = "text-[length:var(--text-h3)]";
const muted = "text-[length:var(--text-small)] text-[var(--color-text-muted)]";
const textarea =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";

// ------------------------------------------------------------- comments --
export type CommentView = {
  id: string;
  parentId: string | null;
  author: string;
  body: string;
  anchor: string | null;
  revisionNumber: number | null;
  createdAt: string;
  resolved: boolean;
  canResolve: boolean;
};

/**
 * INTERNAL COMMENTS (D-123). Staff only — RLS limits them to people who can
 * see the article, and no public function returns them. Said so on screen
 * too, so nobody writes one thinking a reader will see it.
 */
export function CommentsPanel({ articleId, revisionId, comments }: { articleId: string; revisionId: string | null; comments: CommentView[] }) {
  const uid = useId();
  const top = comments.filter((c) => !c.parentId);
  const open = top.filter((c) => !c.resolved);
  const resolved = top.filter((c) => c.resolved);
  return (
    <section aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className={h3}>Comments</h3>
      <p className={`mt-[var(--space-xs)] ${muted}`}>Only Journal staff working on this article can see these. They are never published.</p>
      <CommentForm articleId={articleId} revisionId={revisionId} label="Add a comment" withQuote />
      {open.length === 0 && <p className={`mt-[var(--space-m)] ${muted}`}>No open comments.</p>}
      <ol className="mt-[var(--space-m)] flex flex-col gap-[var(--space-l)]">
        {open.map((c) => <Thread key={c.id} c={c} replies={comments.filter((r) => r.parentId === c.id)} articleId={articleId} revisionId={revisionId} />)}
      </ol>
      {resolved.length > 0 && (
        <details className="mt-[var(--space-l)]">
          <summary className="min-h-[var(--target-min)] cursor-pointer py-[var(--space-s)] underline underline-offset-4">
            Resolved comments ({resolved.length})
          </summary>
          <ol className="mt-[var(--space-s)] flex flex-col gap-[var(--space-l)]">
            {resolved.map((c) => <Thread key={c.id} c={c} replies={comments.filter((r) => r.parentId === c.id)} articleId={articleId} revisionId={revisionId} />)}
          </ol>
        </details>
      )}
    </section>
  );
}

function Thread({ c, replies, articleId, revisionId }: { c: CommentView; replies: CommentView[]; articleId: string; revisionId: string | null }) {
  return (
    <li className="border-l-2 border-[var(--color-border)] pl-[var(--space-m)]">
      <CommentBody c={c} />
      {replies.length > 0 && (
        <ol className="mt-[var(--space-s)] flex flex-col gap-[var(--space-s)] pl-[var(--space-m)]">
          {replies.map((r) => <li key={r.id}><CommentBody c={r} /></li>)}
        </ol>
      )}
      <div className="mt-[var(--space-s)] flex flex-wrap items-start gap-[var(--space-m)]">
        {!c.resolved && (
          <details>
            <summary className="min-h-[var(--target-min)] cursor-pointer py-[var(--space-s)] underline underline-offset-4">Reply</summary>
            <CommentForm articleId={articleId} revisionId={revisionId} parentId={c.id} label="Your reply" />
          </details>
        )}
        {c.canResolve && (
          <ActionButton action={resolveCommentAction} fields={{ articleId, commentId: c.id, resolved: c.resolved ? 0 : 1 }} label={c.resolved ? "Reopen" : "Mark resolved"} variant="text" />
        )}
      </div>
    </li>
  );
}

function CommentBody({ c }: { c: CommentView }) {
  return (
    <div>
      <p className={muted}>
        <span className="font-medium text-[var(--color-text)]">{c.author}</span> · {new Date(c.createdAt).toLocaleString("en-GB")}
        {c.revisionNumber ? ` · on version ${c.revisionNumber}` : ""}
        {c.resolved ? " · Resolved" : ""}
      </p>
      {c.anchor && <blockquote className="mt-[var(--space-xs)] border-l-2 border-[var(--color-border-strong)] pl-[var(--space-s)] italic">{c.anchor}</blockquote>}
      <p className="mt-[var(--space-xs)] whitespace-pre-line">{c.body}</p>
    </div>
  );
}

function CommentForm({ articleId, revisionId, parentId, label, withQuote = false }: { articleId: string; revisionId: string | null; parentId?: string; label: string; withQuote?: boolean }) {
  const uid = useId();
  const [state, dispatch, pending] = useActionState(addCommentAction, {} as JournalState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={dispatch} className="mt-[var(--space-m)] flex flex-col gap-[var(--space-s)]">
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="revisionId" value={revisionId ?? ""} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      {withQuote && (
        <Field label="Quote the passage (optional)" htmlFor={`${uid}-a`}>
          <Input id={`${uid}-a`} name="anchor" maxLength={500} />
        </Field>
      )}
      <Field label={label} htmlFor={`${uid}-b`} error={state.fieldErrors?.body}>
        <textarea id={`${uid}-b`} name="body" rows={3} maxLength={5000} className={textarea} />
      </Field>
      <div>
        <Button type="submit" variant="secondary" isLoading={pending} loadingLabel="Posting…">{parentId ? "Reply" : "Comment"}</Button>
      </div>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
    </form>
  );
}

// ---------------------------------------------------------------- media --
export function ImagesPanel({ articleId, media, canEdit }: { articleId: string; media: { id: string; alt: string | null; isPublic: boolean }[]; canEdit: boolean }) {
  const uid = useId();
  const [state, dispatch, pending] = useActionState(uploadImageAction, {} as JournalState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <section aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className={h3}>Images</h3>
      <p className={`mt-[var(--space-xs)] ${muted}`}>PNG, JPEG, WebP or GIF, up to 10 MB. An image is private until a published version uses it.</p>
      {canEdit && (
        <form ref={ref} action={dispatch} className="mt-[var(--space-m)] flex flex-col gap-[var(--space-s)]">
          <input type="hidden" name="articleId" value={articleId} />
          <Field label="Image file" htmlFor={`${uid}-f`} error={state.fieldErrors?.file}>
            <input id={`${uid}-f`} name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="min-h-[var(--target-min)]" />
          </Field>
          <Field label="Description (alt text)" htmlFor={`${uid}-alt`} hint="What the image shows, for people who can't see it." error={state.fieldErrors?.alt}>
            <Input id={`${uid}-alt`} name="alt" maxLength={500} />
          </Field>
          <div>
            <Button type="submit" variant="secondary" isLoading={pending} loadingLabel="Uploading…">Upload image</Button>
          </div>
          <FormError message={state.error} />
          <FormNotice message={state.notice} />
        </form>
      )}
      {media.length > 0 && (
        <ul className="mt-[var(--space-m)] grid grid-cols-2 gap-[var(--space-s)]">
          {media.map((m) => (
            <li key={m.id} className="text-[length:var(--text-small)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(m.id)} alt="" className="aspect-[4/3] w-full rounded-[var(--radius-control)] border border-[var(--color-border)] object-cover" />
              <p className="mt-[var(--space-xs)]">{m.alt || "No description"}</p>
              <p className={muted}>{m.isPublic ? "Public (used by the live version)" : "Private"}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --------------------------------------------------------------- people --
export function PeoplePanel({
  articleId,
  members,
  writers,
  canManage,
}: {
  articleId: string;
  members: { id: string; name: string; role: "author" | "collaborator" }[];
  writers: { id: string; name: string }[];
  canManage: boolean;
}) {
  const uid = useId();
  const [state, dispatch, pending] = useActionState(setMemberAction, {} as JournalState);
  const choices = writers.filter((w) => !members.some((m) => m.id === w.id));
  return (
    <section aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className={h3}>Who can edit</h3>
      <p className={`mt-[var(--space-xs)] ${muted}`}>Writers edit only articles they are on. Editors can edit every article.</p>
      <ul className="mt-[var(--space-s)] flex flex-col gap-[var(--space-s)]">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-[var(--space-s)]">
            <span>{m.name} <span className={muted}>· {m.role === "author" ? "Author" : "Collaborator"}</span></span>
            {canManage && <ActionButton action={setMemberAction} fields={{ articleId, profileId: m.id, role: "" }} label={`Remove ${m.name}`} variant="text" />}
          </li>
        ))}
      </ul>
      {canManage && choices.length > 0 && (
        <form action={dispatch} className="mt-[var(--space-m)] flex flex-wrap items-end gap-[var(--space-s)]">
          <input type="hidden" name="articleId" value={articleId} />
          <input type="hidden" name="role" value="collaborator" />
          <div className="flex min-w-[12rem] flex-1 flex-col gap-[var(--space-xs)]">
            <label htmlFor={`${uid}-p`} className="text-[length:var(--text-label)] font-medium">Add a collaborator</label>
            <select id={`${uid}-p`} name="profileId" className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
              {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Button type="submit" variant="secondary" isLoading={pending} loadingLabel="Adding…">Add</Button>
        </form>
      )}
      <FormError message={state.error ?? state.fieldErrors?.profileId} />
      <FormNotice message={state.notice} />
    </section>
  );
}
