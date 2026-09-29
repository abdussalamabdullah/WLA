"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  generateChildCodeAction,
  revokeChildCodeAction,
  type ChildCodeState,
} from "@/features/child-auth/parent-actions";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";

const initial: ChildCodeState = {};

export type AccessState = {
  hasCode: boolean;
  lastUsedAt: string | null;
  createdAt: string | null;
};

/**
 * CHILD ACCESS — brief §4/§25 copy.
 *
 * Shows whether a code exists and when it was last used. It never claims to
 * show the code itself except in the moment after one is made.
 */
export function ChildAccessPanel({
  childId,
  childName,
  access,
}: {
  childId: string;
  childName: string;
  access: AccessState;
}) {
  const [genState, generate, generating] = useActionState(
    generateChildCodeAction,
    initial,
  );
  const [revState, revoke, revoking] = useActionState(
    revokeChildCodeAction,
    initial,
  );

  const hasCode = access.hasCode && !revState.revoked;

  return (
    <section className="mt-[var(--space-2xl)] border-t border-[var(--color-border)] pt-[var(--space-l)]">
      <h2 className="text-[length:var(--text-h3)]">Child access</h2>
      <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)]">
        {childName} can use a code to open their missions on their own.
      </p>

      {genState.error && <div className="mt-[var(--space-m)]"><FormError message={genState.error} /></div>}
      {revState.error && <div className="mt-[var(--space-m)]"><FormError message={revState.error} /></div>}

      {/* The one moment the code is visible. */}
      {genState.code && (
        <div className="mt-[var(--space-m)] rounded-[var(--radius-surface)] border border-[var(--color-border-strong)] bg-[var(--color-surface-sage)] p-[var(--space-m)]">
          <p className="text-[length:var(--text-small)]">
            {childName}&rsquo;s new code. Write it down now &mdash; it
            can&rsquo;t be shown again.
          </p>
          <p className="mt-[var(--space-s)] font-[family-name:var(--font-serif)] text-[length:var(--text-h1)] tracking-[0.12em]">
            {genState.code}
          </p>
          <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            They enter it at{" "}
            <Link href="/child/login" className="underline underline-offset-4">
              Child sign in
            </Link>
            . Making a new code stops the old one working.
          </p>
        </div>
      )}

      <div className="mt-[var(--space-m)] flex flex-wrap items-center gap-[var(--space-m)]">
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {hasCode
            ? access.lastUsedAt
              ? `A code is active. Last used ${new Date(access.lastUsedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`
              : "A code is active. It hasn't been used yet."
            : "No code yet."}
        </p>
      </div>

      <div className="mt-[var(--space-m)] flex flex-wrap gap-[var(--space-s)]">
        <form action={generate}>
          <input type="hidden" name="childId" value={childId} />
          <Button type="submit" isLoading={generating} loadingLabel="Making…">
            {hasCode ? "Make a new code" : "Create a code"}
          </Button>
        </form>

        {hasCode && (
          <form action={revoke}>
            <input type="hidden" name="childId" value={childId} />
            <Button type="submit" variant="text" isLoading={revoking} loadingLabel="Turning off…">
              Turn off this code
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
