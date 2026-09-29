"use client";

import { useActionState, useState } from "react";
import {
  createVersionAction,
  setVersionStatusAction,
  deleteMissionAction,
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
