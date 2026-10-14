"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createVersionAction, type BuilderState } from "@/features/admin/builder-actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

const initial: BuilderState = {};

/**
 * On a locked (published or archived) version: start a new draft from it,
 * here, in one step (D-119). Uses the same action as the mission page; the
 * copy is made by `create_mission_version`, and the locked version — and every
 * learner pinned to it — is untouched. Success redirects to the new draft.
 */
export function CreateDraftButton({
  missionId, slug, version, openDraft,
}: {
  missionId: string; slug: string; version: number;
  /** A draft or in-review version that already exists, if any. */
  openDraft: number | null;
}) {
  const [state, action, pending] = useActionState(createVersionAction, initial);

  if (openDraft !== null) {
    return (
      <p className="wla-measure">
        Version {openDraft} is already a draft, so changes go there.{" "}
        <Link href={`/admin/builder/${slug}/${openDraft}`} className="inline-flex min-h-[var(--target-min)] items-center underline decoration-[var(--color-border-strong)] underline-offset-4">
          Open version {openDraft}
        </Link>
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-[var(--space-s)]">
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="fromVersion" value={version} />
      {state.error && <FormError message={state.error} />}
      <p className="wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        This copies version {version} into a new draft you can change. Version {version} stays exactly as it is, and
        no learner sees the draft until you publish it.
      </p>
      <div>
        <Button type="submit" isLoading={pending} loadingLabel="Creating the draft…">
          Create a new draft from version {version}
        </Button>
      </div>
    </form>
  );
}
