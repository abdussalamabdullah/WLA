"use client";

import { useActionState, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice } from "@/components/ui/field";
import {
  archiveAction,
  assignReviewerAction,
  cancelScheduleAction,
  decideAction,
  deleteArticleAction,
  publishAction,
  scheduleAction,
  startRevisionAction,
  unpublishAction,
  withdrawAction,
  type JournalState,
} from "@/features/journal/actions";
import { useUnsavedChanges } from "@/components/admin/unsaved-changes";
import { formatLondon, JOURNAL_TIME_ZONE, londonWallTimeToUtc } from "@/features/journal/time";
import type { JournalRevisionState } from "@/types/database";
import { ActionButton } from "./action-button";

const PUBLISHABLE: JournalRevisionState[] = ["draft", "changes_requested", "in_review", "approved"];

export type WorkflowProps = {
  articleId: string;
  caps: { canWrite: boolean; canReview: boolean; isEditor: boolean };
  canEdit: boolean;
  /** Editors, or a writer who is this article's author (D-130). */
  canPublish: boolean;
  archived: boolean;
  everPublished: boolean;
  live: { id: string; number: number; slug: string } | null;
  working: { id: string; number: number; state: JournalRevisionState; contentHash: string } | null;
  scheduled: { revisionNumber: number | null; at: string; by: string } | null;
  /** Editors only: is automatic publishing running (D-132)? */
  scheduler: { configured: boolean; active: boolean; lastRunAt: string | null; lastStatus: string | null; overdue: number } | null;
  reviewers: { id: string; name: string }[];
  reviewerChoices: { id: string; name: string }[];
  isAssignedReviewer: boolean;
  editedWorkingRevision: boolean;
};

const h3 = "text-[length:var(--text-h3)]";
const muted = "mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]";

/**
 * What can happen next, for THIS person, in words. Buttons appear only for
 * steps the database would allow; the database still decides (D-124, D-130).
 * Review is optional: it never stands between an author and publishing.
 */
export function WorkflowPanel(p: WorkflowProps) {
  const w = p.working;
  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      {p.archived && (
        <section>
          <h3 className={h3}>Archived</h3>
          <p className={muted}>It is off the public Journal and can&rsquo;t be edited. Restoring it brings it back as unpublished.</p>
          {p.caps.isEditor && (
            <div className="mt-[var(--space-m)]">
              <ActionButton action={archiveAction} fields={{ articleId: p.articleId, archive: 0 }} label="Restore from the archive" />
            </div>
          )}
        </section>
      )}

      {!p.archived && w && p.canEdit && w.state === "in_review" && (
        <section>
          <h3 className={h3}>In review</h3>
          <p className={muted}>Version {w.number} is locked while a reviewer looks at it. Withdraw it to make more changes.</p>
          <div className="mt-[var(--space-m)]">
            <ActionButton action={withdrawAction} fields={{ articleId: p.articleId, revisionId: w.id }} label="Withdraw from review" />
          </div>
        </section>
      )}

      {!p.archived && w && p.canEdit && (w.state === "approved" || w.state === "live") && (
        <section>
          <h3 className={h3}>Make changes</h3>
          <p className={muted}>
            {w.state === "live"
              ? "This version is live. Changes go into a new version; readers keep seeing this one until you publish the new version."
              : "This version was approved in review and is locked. Changing it starts a new version."}
          </p>
          {p.scheduled ? (
            <p className="mt-[var(--space-s)] text-[length:var(--text-small)]">Cancel the schedule before starting a new version.</p>
          ) : (
            <div className="mt-[var(--space-m)]">
              <ActionButton action={startRevisionAction} fields={{ articleId: p.articleId }} label="Start a new version" pendingLabel="Starting…" />
            </div>
          )}
        </section>
      )}

      {w && w.state === "in_review" && p.isAssignedReviewer && <DecisionForm articleId={p.articleId} revisionId={w.id} number={w.number} contentHash={w.contentHash} ownChanges={p.editedWorkingRevision} />}

      {p.canPublish && !p.archived && <PublishingSection {...p} />}

      {(p.caps.isEditor || p.reviewers.length > 0) && !p.archived && (
        <ReviewersSection {...p} />
      )}

      {p.caps.isEditor && !p.archived && (
        <section>
          <h3 className={h3}>Archive</h3>
          <p className={muted}>Takes it off the public Journal, cancels any schedule and locks it. Nothing is deleted.</p>
          <div className="mt-[var(--space-m)] flex flex-wrap gap-[var(--space-m)]">
            <ActionButton
              action={archiveAction}
              fields={{ articleId: p.articleId, archive: 1 }}
              label="Archive"
              confirm={{ title: "Archive this article?", body: <p>It will disappear from the public Journal straight away and can&rsquo;t be edited until it is restored.</p>, confirmLabel: "Archive", destructive: true }}
            />
            {!p.everPublished && (
              <ActionButton
                action={deleteArticleAction}
                fields={{ articleId: p.articleId }}
                label="Delete draft"
                variant="text"
                confirm={{ title: "Delete this draft for good?", body: <p>Every version, comment and review of it is removed. The audit record of the deletion is kept. This can&rsquo;t be undone.</p>, confirmLabel: "Delete", destructive: true }}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function DecisionForm({ articleId, revisionId, number, contentHash, ownChanges }: { articleId: string; revisionId: string; number: number; contentHash: string; ownChanges: boolean }) {
  const uid = useId();
  const [state, dispatch, pending] = useActionState(decideAction, {} as JournalState);
  const [decision, setDecision] = useState<"approve" | "request_changes">("approve");
  if (ownChanges) {
    return (
      <section>
        <h3 className={h3}>Your review</h3>
        <p className={muted}>You edited version {number}, so your review of it can&rsquo;t be recorded. That doesn&rsquo;t stop anyone publishing it.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className={h3}>Your review of version {number}</h3>
      <p className={muted}>Your decision is recorded against exactly the content you can see. Review is optional — the author can publish either way.</p>
      <form action={dispatch} className="mt-[var(--space-m)] flex flex-col gap-[var(--space-m)]">
        <input type="hidden" name="articleId" value={articleId} />
        <input type="hidden" name="revisionId" value={revisionId} />
        <input type="hidden" name="contentHash" value={contentHash} />
        <fieldset className="flex flex-col gap-[var(--space-xs)]">
          <legend className="text-[length:var(--text-label)] font-medium">Decision</legend>
          {(["approve", "request_changes"] as const).map((d) => (
            <label key={d} className="flex min-h-[var(--target-min)] items-center gap-[var(--space-s)]">
              <input type="radio" name="decision" value={d} checked={decision === d} onChange={() => setDecision(d)} className="h-5 w-5 accent-[var(--color-primary)]" />
              {d === "approve" ? "Approve this version" : "Request changes"}
            </label>
          ))}
        </fieldset>
        <Field label={decision === "approve" ? "Note (optional)" : "What needs to change"} htmlFor={`${uid}-note`} error={state.fieldErrors?.note}>
          <textarea id={`${uid}-note`} name="note" rows={4} maxLength={5000} className="w-full rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]" />
        </Field>
        <div>
          <Button type="submit" isLoading={pending} loadingLabel="Recording…">{decision === "approve" ? "Approve" : "Request changes"}</Button>
        </div>
        <FormError message={state.error} />
        <FormNotice message={state.notice} />
      </form>
    </section>
  );
}

function ReviewersSection(p: WorkflowProps) {
  const uid = useId();
  const [state, dispatch, pending] = useActionState(assignReviewerAction, {} as JournalState);
  const choices = p.reviewerChoices.filter((c) => !p.reviewers.some((r) => r.id === c.id));
  return (
    <section aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className={h3}>Reviewers (optional)</h3>
      {p.reviewers.length === 0 ? (
        <p className={muted}>Nobody is asked to review this article. Reviews are optional: an editor can ask someone for a second opinion, but nobody needs to approve an article before it is published.</p>
      ) : (
        <ul className="mt-[var(--space-s)] flex flex-col gap-[var(--space-s)]">
          {p.reviewers.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-[var(--space-s)]">
              <span>{r.name}</span>
              {p.caps.isEditor && (
                <ActionButton action={assignReviewerAction} fields={{ articleId: p.articleId, reviewerId: r.id, assign: 0 }} label={`Remove ${r.name}`} variant="text" />
              )}
            </li>
          ))}
        </ul>
      )}
      {p.caps.isEditor && choices.length > 0 && (
        <form action={dispatch} className="mt-[var(--space-m)] flex flex-wrap items-end gap-[var(--space-s)]">
          <input type="hidden" name="articleId" value={p.articleId} />
          <input type="hidden" name="assign" value="1" />
          <div className="flex min-w-[12rem] flex-1 flex-col gap-[var(--space-xs)]">
            <label htmlFor={`${uid}-r`} className="text-[length:var(--text-label)] font-medium">Assign a reviewer</label>
            <select id={`${uid}-r`} name="reviewerId" className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
              {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <Button type="submit" variant="secondary" isLoading={pending} loadingLabel="Assigning…">Assign</Button>
        </form>
      )}
      <FormError message={state.error ?? state.fieldErrors?.reviewerId} />
      <FormNotice message={state.notice} />
    </section>
  );
}

function PublishingSection(p: WorkflowProps) {
  const uid = useId();
  const [local, setLocal] = useState("");
  const { dirtyIds } = useUnsavedChanges();
  const unsaved = dirtyIds.includes("revision");
  const w = p.working;
  const target = w && PUBLISHABLE.includes(w.state) && w.id !== p.live?.id ? w : null;
  const preview = local ? londonWallTimeToUtc(local) : null;
  return (
    <section aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className={h3}>Publishing</h3>
      <p className={muted}>
        {p.live ? `Live now: version ${p.live.number}, at /journal/${p.live.slug} on the public site.` : "Not on the public Journal."}
      </p>

      {p.scheduler && <SchedulerHealth s={p.scheduler} />}

      {p.scheduled && (
        <div className="mt-[var(--space-m)]">
          <p className="text-[length:var(--text-small)]">
            Scheduled: version {p.scheduled.revisionNumber ?? "?"} will be published automatically on {formatLondon(p.scheduled.at)}, scheduled by {p.scheduled.by}. It is locked until then; the rules are checked again at that moment.
          </p>
          <div className="mt-[var(--space-s)]">
            <ActionButton action={cancelScheduleAction} fields={{ articleId: p.articleId }} label="Cancel schedule" />
          </div>
        </div>
      )}

      {target && !p.scheduled && unsaved && (
        <p className="mt-[var(--space-m)] text-[length:var(--text-small)]">Save your changes before publishing or scheduling. Only saved content can be published.</p>
      )}

      {target && !p.scheduled && !unsaved && (
        <div className="mt-[var(--space-m)] flex flex-col gap-[var(--space-l)]">
          <ActionButton
            action={publishAction}
            fields={{ articleId: p.articleId, revisionId: target.id, contentHash: target.contentHash }}
            label={`Publish version ${target.number} now`}
            variant="primary"
            pendingLabel="Publishing…"
            confirm={{
              title: `Publish version ${target.number}?`,
              body: (
                <p>
                  {p.live
                    ? `It replaces version ${p.live.number} on the public Journal straight away.`
                    : "It appears on the public Journal straight away."}{" "}
                  Exactly the content you last saved is published.
                </p>
              ),
              confirmLabel: "Publish",
            }}
          />
          <ActionButton action={scheduleAction} fields={{ articleId: p.articleId, revisionId: target.id, contentHash: target.contentHash, atLocal: local }} label={`Schedule version ${target.number}`} pendingLabel="Scheduling…">
            <div className="flex flex-col gap-[var(--space-xs)]">
              <label htmlFor={`${uid}-at`} className="text-[length:var(--text-label)] font-medium">Publish at — UK time ({JOURNAL_TIME_ZONE})</label>
              <p id={`${uid}-at-hint`} className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Always UK time, whatever your device&rsquo;s time zone. It is published automatically at that moment.
              </p>
              <input
                id={`${uid}-at`}
                type="datetime-local"
                value={local}
                aria-describedby={`${uid}-at-hint ${uid}-at-preview`}
                onChange={(e) => setLocal(e.target.value)}
                className="min-h-[var(--target-min)] max-w-[18rem] rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-s)] focus-within:shadow-[var(--focus-ring)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
              />
              <p id={`${uid}-at-preview`} role="status" className="text-[length:var(--text-small)]">
                {preview?.ok
                  ? `= ${formatLondon(preview.utc)}${preview.ambiguous ? " — the first of the two 01:00 hours as the clocks go back" : ""}`
                  : preview && preview.reason === "nonexistent"
                    ? "That time doesn't exist in the UK (the clocks go forward)."
                    : ""}
              </p>
            </div>
          </ActionButton>
        </div>
      )}

      {!target && !p.scheduled && (
        <p className="mt-[var(--space-s)] text-[length:var(--text-small)]">
          {w?.state === "live" ? "The newest version is the live one. Start a new version to make changes." : "Nothing new to publish."}
        </p>
      )}

      {p.live && (
        <div className="mt-[var(--space-l)]">
          <ActionButton
            action={unpublishAction}
            fields={{ articleId: p.articleId }}
            label="Unpublish"
            confirm={{ title: "Unpublish this article?", body: <p>It disappears from the public Journal straight away. Nothing is deleted, and you can publish it again.</p>, confirmLabel: "Unpublish", destructive: true }}
          />
        </div>
      )}
    </section>
  );
}

/** Words, not colour (Architecture §20): is the automatic publisher running? */
function SchedulerHealth({ s }: { s: NonNullable<WorkflowProps["scheduler"]> }) {
  const healthy = s.configured && s.active && s.overdue === 0;
  return (
    <p role={healthy ? undefined : "alert"} className={`mt-[var(--space-s)] text-[length:var(--text-small)] ${healthy ? "text-[var(--color-text-muted)]" : "rounded-[var(--radius-input)] border border-[var(--color-error)] p-[var(--space-s)]"}`}>
      {!s.configured
        ? "Automatic publishing is NOT set up on this database, so scheduled articles will not publish. See docs/JOURNAL-CMS.md → Scheduler."
        : !s.active
          ? "Automatic publishing is switched off, so scheduled articles will not publish."
          : s.overdue > 0
            ? `${s.overdue} scheduled ${s.overdue === 1 ? "article is" : "articles are"} overdue: the automatic publisher may not be running. It catches up on its next run.`
            : `Automatic publishing is running${s.lastRunAt ? ` (last run ${formatLondon(s.lastRunAt)}${s.lastStatus && s.lastStatus !== "succeeded" ? `, ${s.lastStatus}` : ""})` : ""}.`}
    </p>
  );
}
