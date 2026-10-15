"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";

import { Dialog } from "@/components/admin/dialog";
import { Button } from "@/components/ui/button";
import { FormError, FormNotice } from "@/components/ui/field";
import type { JournalState } from "@/features/journal/actions";

type Action = (prev: JournalState, fd: FormData) => Promise<JournalState>;

/**
 * One workflow step as a form: hidden ids, one button, its result beneath.
 * With `confirm`, the button opens a dialog first (publishing, unpublishing,
 * archiving, deleting); cancelling is the focused, safe default.
 *
 * The server still decides: hiding or showing this button is presentation.
 */
export function ActionButton({
  action,
  fields,
  label,
  pendingLabel,
  variant = "secondary",
  confirm,
  children,
}: {
  action: Action;
  fields: Record<string, string | number>;
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "text";
  confirm?: { title: string; body: ReactNode; confirmLabel: string; destructive?: boolean };
  /** Extra controls rendered inside the form (e.g. a date). */
  children?: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [asking, setAsking] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={dispatch} className="flex flex-col gap-[var(--space-s)]">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      {children}
      <div>
        <Button
          type={confirm ? "button" : "submit"}
          variant={variant}
          isLoading={pending}
          loadingLabel={pendingLabel ?? "Working…"}
          onClick={confirm ? () => setAsking(true) : undefined}
        >
          {label}
        </Button>
      </div>
      <FormError message={state.error ?? Object.values(state.fieldErrors ?? {})[0]} />
      <FormNotice message={state.notice} />
      {confirm && (
        <Dialog open={asking} onClose={() => setAsking(false)} title={confirm.title} role="alertdialog">
          <div className="wla-measure">{confirm.body}</div>
          <div className="mt-[var(--space-l)] flex flex-wrap gap-[var(--space-m)]">
            <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirm.destructive ? "text" : "primary"}
              className={confirm.destructive ? "text-[color:var(--color-error)]" : undefined}
              onClick={() => {
                setAsking(false);
                formRef.current?.requestSubmit();
              }}
            >
              {confirm.confirmLabel}
            </Button>
          </div>
        </Dialog>
      )}
    </form>
  );
}
