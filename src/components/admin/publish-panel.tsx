"use client";

import { useActionState, useState } from "react";
import { setVersionStatusAction, type BuilderState } from "@/features/admin/builder-actions";
import { Button } from "@/components/ui/button";
import { FormError, FormNotice } from "@/components/ui/field";
import { Dialog } from "./dialog";

const initial: BuilderState = {};

/**
 * REVIEW AND PUBLISH — the version's status (D-121).
 *
 * "In review" is a label, not a gate: it locks nothing, assigns nobody, and
 * publishing does not require it (`set_mission_version_status` allows
 * draft → published). The copy says exactly that. Whether review should be
 * mandatory is an open product question (OPEN-DECISIONS), not settled here.
 *
 * Publishing asks first. The confirmation states what will happen using the
 * real version and usage figures the page loaded; it never claims the checks
 * passed beyond what the automated QA found, and the database re-validates in
 * the publishing transaction regardless of what this panel shows.
 */
export function PublishPanel({
  missionId, slug, version, status, blockingCount, advisoryCount, impact,
}: {
  missionId: string; slug: string; version: number; status: string;
  blockingCount: number; advisoryCount: number;
  /** Sentences from `publishImpact`, built from real data. */
  impact: string[];
}) {
  const [state, action, pending] = useActionState(setVersionStatusAction, initial);
  const [publishState, publishAction, publishing] = useActionState(setVersionStatusAction, initial);
  const [confirming, setConfirming] = useState(false);
  const canPublish = blockingCount === 0;


  return (
    <div className="mt-[var(--space-xl)] rounded-[var(--radius-surface)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-[var(--space-m)]">
      <h3 className="text-[length:var(--text-label)] font-medium">Status</h3>
      {state.error && <div className="mt-[var(--space-s)]"><FormError message={state.error} /></div>}
      {state.ok && <div className="mt-[var(--space-s)]"><FormNotice message="Status updated." /></div>}
      {publishState.ok && <div className="mt-[var(--space-s)]"><FormNotice message={`Version ${version} is now live for learners.`} /></div>}

      <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {status === "in_review"
          ? "Marked as ready for review. That's a signal to the team only: it locks nothing, and it can still be edited, returned to draft or published."
          : "A draft. Marking it ready for review tells the team it's ready to be checked. Like publishing, it needs the automatic checks to pass, but it doesn't lock anything or notify anyone, and publishing doesn't require it."}
      </p>

      <div className="mt-[var(--space-m)] flex flex-wrap items-center gap-[var(--space-s)]">
        {status === "draft" && (
          <form action={action}>
            <Hidden missionId={missionId} slug={slug} version={version} status="in_review" />
            <Button type="submit" variant="secondary" isLoading={pending} loadingLabel="Saving…" disabled={!canPublish}>
              Mark as ready for review
            </Button>
          </form>
        )}
        {status === "in_review" && (
          <form action={action}>
            <Hidden missionId={missionId} slug={slug} version={version} status="draft" />
            <Button type="submit" variant="text" isLoading={pending} loadingLabel="Saving…">
              Return to draft
            </Button>
          </form>
        )}
        <Button type="button" disabled={!canPublish} onClick={() => setConfirming(true)}>
          Publish version {version} for learners…
        </Button>
      </div>

      {!canPublish && (
        <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Publishing{status === "draft" ? " and marking as ready for review are" : " is"} unavailable while {blockingCount === 1 ? "1 problem needs" : `${blockingCount} problems need`} fixing. They are listed above.
        </p>
      )}

      <Dialog open={confirming && !publishState.ok} onClose={() => { if (!publishing) setConfirming(false); }} title={`Publish version ${version} for learners?`} role="alertdialog">
        <form action={publishAction} className="flex flex-col gap-[var(--space-s)]">
          <Hidden missionId={missionId} slug={slug} version={version} status="published" />
          {publishState.error && <FormError message={publishState.error} />}
          <p className="text-[length:var(--text-small)]">
            The automatic checks found no blocking problems
            {advisoryCount > 0 ? `, and ${advisoryCount} suggestion${advisoryCount === 1 ? "" : "s"} you may want to look at first` : ""}.
            They run again when you confirm, and nothing is published if they fail.
          </p>
          <ul className="flex list-disc flex-col gap-[var(--space-xs)] pl-[var(--space-l)] text-[length:var(--text-small)]">
            {impact.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            A published version can&rsquo;t be edited. To change it later, you create a new draft from it.
          </p>
          <div className="mt-[var(--space-s)] flex flex-wrap gap-[var(--space-m)]">
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={publishing}>Cancel</Button>
            <Button type="submit" isLoading={publishing} loadingLabel="Publishing…">Publish version {version}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function Hidden({
  missionId, slug, version, status,
}: { missionId: string; slug: string; version: number; status: string }) {
  return (
    <>
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="status" value={status} />
    </>
  );
}
