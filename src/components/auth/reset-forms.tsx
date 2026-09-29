"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import {
  requestPasswordResetAction,
  updatePasswordAction,
} from "@/features/auth/actions";
import { emptyFormState } from "@/features/auth/schemas";

export function RequestResetForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-[var(--space-l)]">
      <FormError message={state.error} />
      <FormNotice message={state.notice} />

      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          invalid={Boolean(state.fieldErrors?.email)}
        />
      </Field>

      <Button
        type="submit"
        size="large"
        isLoading={isPending}
        loadingLabel="Sending…"
      >
        Send reset link
      </Button>

      <Link
        href="/login"
        className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
      >
        Back to sign in
      </Link>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    updatePasswordAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-[var(--space-l)]">
      <FormError message={state.error} />

      <Field
        label="New password"
        htmlFor="password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          invalid={Boolean(state.fieldErrors?.password)}
        />
      </Field>

      <Button
        type="submit"
        size="large"
        isLoading={isPending}
        loadingLabel="Saving…"
      >
        Save password
      </Button>
    </form>
  );
}
