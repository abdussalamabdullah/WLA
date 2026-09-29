"use client";

import { useActionState } from "react";
import { childLoginAction, type ChildLoginState } from "@/features/child-auth/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError } from "@/components/ui/field";

const initial: ChildLoginState = {};

/**
 * The only field a child ever fills in.
 *
 * `autoComplete="off"` and `autoCapitalize="characters"`: codes are upper-case
 * and are not a password a browser should remember on a shared family device.
 * `inputMode="text"` rather than numeric — the alphabet is letters and digits.
 */
export function ChildLoginForm() {
  const [state, action, pending] = useActionState(childLoginAction, initial);

  return (
    <form action={action} className="flex flex-col gap-[var(--space-l)]">
      {state.error && <FormError message={state.error} />}

      <Field label="Child code" htmlFor="code">
        <Input
          id="code"
          name="code"
          required
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCD-2345"
          aria-describedby="code-hint"
          className="text-center text-[length:var(--text-h3)] tracking-[0.18em] uppercase"
        />
      </Field>
      <p id="code-hint" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Ask a parent for your code if you don&rsquo;t have one.
      </p>

      <Button type="submit" size="large" isLoading={pending} loadingLabel="Checking…">
        Continue
      </Button>
    </form>
  );
}
