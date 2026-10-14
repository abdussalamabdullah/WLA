"use client";

import { useActionState, useId } from "react";
import { insertPatternAction, type BuilderState } from "@/features/admin/builder-actions";
import { missionPatterns } from "@/features/mission-engine/patterns";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError, FormNotice } from "@/components/ui/field";

const initial: BuilderState = {};

/**
 * Plan §12 — start from a proven WLA mission structure.
 *
 * `open` renders the form directly (the empty state's "Start from a proven
 * pattern"); otherwise it sits behind "Add a mission pattern". Choosing a
 * pattern creates nothing — only "Add the pattern" does.
 */
export function PatternPicker({ missionId, slug, version, suggestedPrefix, open = false }: { missionId: string; slug: string; version: number; suggestedPrefix: string; open?: boolean }) {
  const [state, action, pending] = useActionState(insertPatternAction, initial);
  const uid = useId();

  const form = (
    <form action={action} className="mt-[var(--space-m)] flex flex-col gap-[var(--space-m)]">
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      {state.error && <FormError message={state.error} />}
      {state.ok && <FormNotice message="Pattern added at the end of the screen list. Replace the text in [square brackets] with your own, then check how it connects to the screens around it — the Flow map shows every connection." />}
      <fieldset className="flex flex-col gap-[var(--space-xs)]">
        <legend className="mb-[var(--space-xs)] text-[length:var(--text-label)] font-medium">Pattern</legend>
        {missionPatterns.map((p, i) => (
          <label key={p.id} className="flex min-h-[var(--target-min)] items-start gap-[var(--space-s)] py-[var(--space-xs)]">
            <input type="radio" name="pattern" value={p.id} defaultChecked={i === 0} className="mt-[4px] h-5 w-5 accent-[var(--color-primary)]" />
            <span className="flex flex-col">
              <span className="font-medium">{p.name}</span>
              <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{p.summary}</span>
            </span>
          </label>
        ))}
        {state.fieldErrors?.pattern && <FormError message={state.fieldErrors.pattern} />}
      </fieldset>
      <details open={Boolean(state.fieldErrors?.prefix)}>
        <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center text-[length:var(--text-small)] text-[var(--color-text-muted)]">Advanced: key prefix</summary>
        <div className="max-w-[20rem]">
          <Field label="Key prefix" htmlFor={`${uid}-prefix`} error={state.fieldErrors?.prefix} hint="Starts every new screen key, so nothing clashes with screens you already have. The suggestion is fine.">
            <Input id={`${uid}-prefix`} name="prefix" defaultValue={suggestedPrefix} />
          </Field>
        </div>
      </details>
      <div><Button type="submit" isLoading={pending} loadingLabel="Adding…">Add the pattern</Button></div>
    </form>
  );

  if (open) return form;

  return (
    <details className="mt-[var(--space-m)] rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
      <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center font-medium">Add a mission pattern</summary>
      <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        A proven structure — its screens, branches and handoffs — added after your existing screens. Everything in square
        brackets is yours to replace; afterwards it is ordinary configuration of this mission.
      </p>
      {form}
    </details>
  );
}
