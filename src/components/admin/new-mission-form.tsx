"use client";

import { useActionState } from "react";
import { createMissionAction, type BuilderState } from "@/features/admin/builder-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError } from "@/components/ui/field";

const initial: BuilderState = {};

const LABS = [
  { value: "challenge", label: "Challenge Lab" },
  { value: "decision", label: "Decision Lab" },
  { value: "curiosity", label: "Curiosity Lab" },
  { value: "wellbeing", label: "Wellbeing Lab" },
  { value: "navigation", label: "Navigation Lab" },
];

/**
 * Step 1 of the builder: Details.
 *
 * The slug is settable ONCE, here. Brief §12 requires structural identity to
 * be protected after publication, and a slug is the most structural thing a
 * mission has — it is in every learner's URL and in every bookmark. There is
 * no code path anywhere that renames one.
 */
export function NewMissionForm() {
  const [state, action, pending] = useActionState(createMissionAction, initial);
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <form action={action} className="flex flex-col gap-[var(--space-l)]">
      {state.error && <FormError message={state.error} />}

      <Field label="Title" htmlFor="title" error={err("title")}>
        <Input id="title" name="title" required placeholder="Mars Bridge Builder" />
      </Field>

      <Field
        label="Address"
        htmlFor="slug"
        error={err("slug")}
        hint="Used in the web address. This can't be changed later."
      >
        <Input id="slug" name="slug" required placeholder="mars-bridge-builder" />
      </Field>

      <Field label="Lab" htmlFor="lab" error={err("lab")}>
        <select
          id="lab"
          name="lab"
          required
          defaultValue="challenge"
          className="min-h-[var(--target-min)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] text-[length:var(--text-label)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        >
          {LABS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </Field>

      <div className="flex gap-[var(--space-m)]">
        <Field label="Youngest age" htmlFor="min_age" error={err("min_age")}>
          <Input id="min_age" name="min_age" type="number" min={3} max={18} defaultValue={7} required />
        </Field>
        <Field label="Oldest age" htmlFor="max_age" error={err("max_age")}>
          <Input id="max_age" name="max_age" type="number" min={3} max={18} defaultValue={11} required />
        </Field>
      </div>

      <Button type="submit" isLoading={pending} loadingLabel="Creating…">
        Create mission
      </Button>
    </form>
  );
}
