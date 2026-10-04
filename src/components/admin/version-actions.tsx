"use client";

import { useActionState, useState } from "react";
import {
  createVersionAction,
  setVersionStatusAction,
  deleteMissionAction,
  duplicateMissionAction,
  type BuilderState,
} from "@/features/admin/builder-actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

const initial: BuilderState = {};

/**
 * Create a version, archive the published one, or delete the mission.
 *
 * Every destructive control states its consequence in plain words before it is
 * used (brief §17). "Archive" and "Delete" are deliberately not adjacent
 * lookalikes: archiving is routine and reversible in effect, deleting is not
 * and is refused outright the moment any learner record exists.
 */
export function VersionActions({
  missionId,
  slug,
  hasEditableDraft,
  publishedVersion,
}: {
  missionId: string;
  slug: string;
  hasEditableDraft: boolean;
  publishedVersion: number | null;
}) {
  const [createState, create, creating] = useActionState(createVersionAction, initial);
  const [statusState, setStatus, settingStatus] = useActionState(setVersionStatusAction, initial);

  return (
    <div className="mt-[var(--space-xl)] flex flex-col gap-[var(--space-l)]">
      {createState.error && <FormError message={createState.error} />}
      {statusState.error && <FormError message={statusState.error} />}

      <div className="flex flex-wrap gap-[var(--space-s)]">
        <form action={create}>
          <input type="hidden" name="missionId" value={missionId} />
          <input type="hidden" name="slug" value={slug} />
          <Button type="submit" isLoading={creating} loadingLabel="Creating…" disabled={hasEditableDraft}>
            Create new version
          </Button>
        </form>

        {publishedVersion !== null && (
          <form action={setStatus}>
            <input type="hidden" name="missionId" value={missionId} />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="version" value={publishedVersion} />
            <input type="hidden" name="status" value="archived" />
            <Button type="submit" variant="secondary" isLoading={settingStatus} loadingLabel="Archiving…">
              Archive v{publishedVersion}
            </Button>
          </form>
        )}
      </div>

      {hasEditableDraft && (
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          There&rsquo;s already a version being worked on. Finish or publish it
          before starting another.
        </p>
      )}

    </div>
  );
}

/**
 * Deleting a mission is not a VERSION operation, so it is its own section with
 * its own heading rather than an h3 tucked under "Versions". The accessibility
 * guard caught the level skip; the fix was the structure, not the level.
 */
export function DeleteMissionPanel({
  missionId,
  totalRuns,
}: {
  missionId: string;
  totalRuns: number;
}) {
  const [state, action, pending] = useActionState(deleteMissionAction, initial);
  const [armed, setArmed] = useState(false);

  if (totalRuns > 0) {
    return (
      <p className="wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        This mission has {totalRuns} learner record{totalRuns === 1 ? "" : "s"}, so
        it can&rsquo;t be deleted. Archive it instead — it disappears for new
        learners and everything families have done stays exactly as it is.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-s)]">
      {state.error && <FormError message={state.error} />}
      {!armed ? (
        <>
          <p className="wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            No child has ever been given this mission, so it can be removed
            completely.
          </p>
          <button
            type="button"
            onClick={() => setArmed(true)}
            className="self-start min-h-[var(--target-min)] text-[length:var(--text-small)] text-[var(--color-error)] underline underline-offset-4"
          >
            Delete this mission
          </button>
        </>
      ) : (
        <form action={action} className="flex flex-col gap-[var(--space-s)]">
          <input type="hidden" name="missionId" value={missionId} />
          <p className="wla-measure text-[length:var(--text-small)]">
            This removes the mission and all its versions for good. It
            can&rsquo;t be undone.
          </p>
          <div className="flex gap-[var(--space-m)]">
            <button type="submit" disabled={pending} className="min-h-[var(--target-min)] text-[length:var(--text-small)] font-medium text-[var(--color-error)] underline underline-offset-4">
              {pending ? "Deleting…" : "Yes, delete it"}
            </button>
            <button type="button" onClick={() => setArmed(false)} className="min-h-[var(--target-min)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * Rollback (§12): start a new draft from an earlier version. The earlier
 * version itself is never reopened — published and archived content stays
 * immutable (D-57); children keep the version they started (D-17).
 */
export function RestoreVersionButton({
  missionId, slug, version, disabled,
}: { missionId: string; slug: string; version: number; disabled: boolean }) {
  const [state, action, pending] = useActionState(createVersionAction, initial);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="fromVersion" value={version} />
      {state.error && <span className="text-[length:var(--text-small)] text-[var(--color-error)]">{state.error} </span>}
      <button
        type="submit"
        disabled={disabled || pending}
        title={disabled ? "Finish or discard the current draft first." : undefined}
        className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4 disabled:opacity-50"
      >
        {pending ? "Restoring…" : "Restore as new draft"}<span className="sr-only"> from version {version}</span>
      </button>
    </form>
  );
}

/** Duplicate a mission into a new, unpublished one (§12). */
export function DuplicateMissionPanel({ missionId, title }: { missionId: string; title: string }) {
  const [state, action, pending] = useActionState(duplicateMissionAction, initial);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="text" onClick={() => setOpen(true)}>Duplicate this mission</Button>
    );
  }
  return (
    <form action={action} className="flex max-w-[34rem] flex-col gap-[var(--space-s)]">
      <input type="hidden" name="missionId" value={missionId} />
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        A new, unpublished mission with this one&rsquo;s screens, logic, Mission Kit and parent note.
        No learner records are copied.
      </p>
      {state.error && <FormError message={state.error} />}
      <label className="flex flex-col gap-[4px] text-[length:var(--text-small)] font-medium">
        Name
        <input name="title" required defaultValue={`${title} (copy)`} className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] font-normal" />
        {state.fieldErrors?.title && <span className="text-[var(--color-error)]">{state.fieldErrors.title}</span>}
      </label>
      <label className="flex flex-col gap-[4px] text-[length:var(--text-small)] font-medium">
        Address
        <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] font-normal" />
        {state.fieldErrors?.slug && <span className="text-[var(--color-error)]">{state.fieldErrors.slug}</span>}
      </label>
      <div className="flex gap-[var(--space-s)]">
        <Button type="submit" isLoading={pending} loadingLabel="Duplicating…">Duplicate</Button>
        <Button type="button" variant="text" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
