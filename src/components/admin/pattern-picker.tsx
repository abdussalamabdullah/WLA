"use client";

import { useActionState } from "react";
import { insertPatternAction, type BuilderState } from "@/features/admin/builder-actions";
import { missionPatterns } from "@/features/mission-engine/patterns";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError, FormNotice } from "@/components/ui/field";

const initial: BuilderState = {};

/** Plan §12 — start from a proven WLA mission structure. */
export function PatternPicker({ missionId, slug, version, suggestedPrefix }: { missionId: string; slug: string; version: number; suggestedPrefix: string }) {
  const [state, action, pending] = useActionState(insertPatternAction, initial);
  return (
    <details className="mt-[var(--space-m)] rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
      <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center font-medium">Add a mission pattern</summary>
      <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        A proven structure — its screens, logic and handoffs — added after your existing screens. Everything in square
        brackets is yours to replace; afterwards it is ordinary configuration of this mission.
      </p>
      <form action={action} className="mt-[var(--space-m)] flex flex-col gap-[var(--space-m)]">
        <input type="hidden" name="missionId" value={missionId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="version" value={version} />
        {state.error && <FormError message={state.error} />}
        {state.ok && <FormNotice message="Pattern added. Connect its last screen onward, then replace the bracketed copy." />}
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
        <div className="max-w-[20rem]">
          <Field label="Key prefix" htmlFor="pattern-prefix" error={state.fieldErrors?.prefix} hint="Starts every new screen key, so nothing clashes.">
            <Input id="pattern-prefix" name="prefix" defaultValue={suggestedPrefix} />
          </Field>
        </div>
        <div><Button type="submit" isLoading={pending} loadingLabel="Adding…">Add the pattern</Button></div>
      </form>
    </details>
  );
}
