"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import {
  createChildAction,
  updateChildAction,
} from "@/features/children/actions";
import { emptyFormState } from "@/features/auth/schemas";
import type { ChildProfileRow } from "@/types/database";

/**
 * Child profile form — UI/UX §18.
 *
 * "The experience should feel family-oriented rather than like social-profile
 * management." Two fields, one optional, no avatar upload: Brief §46 keeps
 * children's identifying information out of the system, and §18 warns against
 * overemphasising profile identity.
 */
export function ChildForm({ child }: { child?: ChildProfileRow }) {
  const action = child
    ? updateChildAction.bind(null, child.id)
    : createChildAction;

  const [state, formAction, isPending] = useActionState(action, emptyFormState);

  return (
    <form action={formAction} className="flex flex-col gap-[var(--space-l)]">
      <FormError message={state.error} />

      <Field
        label="Name"
        htmlFor="displayName"
        hint="A first name or nickname is enough."
        error={state.fieldErrors?.displayName}
      >
        <Input
          id="displayName"
          name="displayName"
          defaultValue={child?.display_name ?? ""}
          required
          maxLength={40}
          invalid={Boolean(state.fieldErrors?.displayName)}
        />
      </Field>

      <Field
        label="Year of birth"
        htmlFor="birthYear"
        hint="Optional. Used only to show which missions suit their age."
        error={state.fieldErrors?.birthYear}
      >
        <Input
          id="birthYear"
          name="birthYear"
          type="number"
          inputMode="numeric"
          defaultValue={child?.birth_year ?? ""}
          placeholder="2014"
          invalid={Boolean(state.fieldErrors?.birthYear)}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-[var(--space-m)]">
        <Button
          type="submit"
          size="large"
          isLoading={isPending}
          loadingLabel="Saving…"
        >
          {child ? "Save changes" : "Add profile"}
        </Button>
        <Link
          href="/account/children"
          className="text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
