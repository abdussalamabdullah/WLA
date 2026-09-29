"use client";

import { useActionState, useState } from "react";
import {
  adminRevokeChildCodeAction,
  type AdminCodeState,
} from "@/features/admin/child-access-actions";

const initial: AdminCodeState = {};

/**
 * Destructive action with an inline confirmation step (brief §17).
 *
 * Two clicks, not a modal and not `window.confirm`: a modal is heavy for one
 * row in a table, and a native confirm cannot explain the consequence in the
 * product's own words. The second state states what will happen before it
 * happens.
 */
export function RevokeCodeButton({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState(
    adminRevokeChildCodeAction,
    initial,
  );

  if (state.done) {
    return <span className="text-[var(--color-text-muted)]">Turned off</span>;
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="min-h-[var(--target-min)] text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
      >
        Turn off code
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-[var(--space-xs)]">
      <input type="hidden" name="childId" value={childId} />
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {childName} will be signed out and will need a new code from their
        parent.
      </p>
      {state.error && (
        <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">
          {state.error}
        </p>
      )}
      <div className="flex gap-[var(--space-s)]">
        <button
          type="submit"
          disabled={pending}
          className="min-h-[var(--target-min)] text-[length:var(--text-small)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4 disabled:opacity-60"
        >
          {pending ? "Turning off…" : "Yes, turn it off"}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="min-h-[var(--target-min)] text-[length:var(--text-small)] text-[var(--color-text-muted)] underline decoration-[var(--color-border)] underline-offset-4"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
