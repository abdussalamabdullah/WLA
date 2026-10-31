"use client";

import { useActionState, useState } from "react";
import {
  generateChildCodeAction,
  revealChildCodeAction,
  revokeChildCodeAction,
  type ChildCodeState,
} from "@/features/child-auth/parent-actions";
import { REPLACE_TO_VIEW } from "@/features/child-auth/copy";
import { Dialog } from "@/components/admin/dialog";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { RevealedCode } from "@/components/child/revealed-code";

const initial: ChildCodeState = {};

export type AccessState = {
  hasCode: boolean;
  /** An encrypted copy exists, so the code can be shown (D-143). */
  viewable: boolean;
  lastUsedAt: string | null;
  createdAt: string | null;
};

type Shown = { code: string; viewable: boolean; intro?: string };

/**
 * CHILD ACCESS — brief §4/§25 copy, D-143.
 *
 * The code reaches the browser only in the response to "Show access code" or to
 * making a new one, and lives only in this component's state: leaving the page
 * forgets it. Replacing it is confirmed first, because it ends the child's
 * sessions and they need the new code to get back in.
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
  const [shown, setShown] = useState<Shown | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showError, setShowError] = useState<string | null>(null);
  const [noCopy, setNoCopy] = useState(false);

  const [genState, generate, generating] = useActionState(
    async (prev: ChildCodeState, formData: FormData) => {
      const result = await generateChildCodeAction(prev, formData);
      setConfirming(false);
      if (result.code) {
        setShowError(null);
        setNoCopy(!result.viewable);
        setShown({
          code: result.code,
          viewable: Boolean(result.viewable),
          intro: result.replaced ? `${childName}’s new code. The old code has stopped working.` : undefined,
        });
      }
      return result;
    },
    initial,
  );
  const [, show, showing] = useActionState(
    async (prev: ChildCodeState, formData: FormData) => {
      const result = await revealChildCodeAction(prev, formData);
      setShowError(result.error ?? null);
      if (result.notViewable) setNoCopy(true);
      if (result.code) {
        setShown({ code: result.code, viewable: true, intro: `${childName}’s access code.` });
      }
      return result;
    },
    initial,
  );
  const [revState, revoke, revoking] = useActionState(
    async (prev: ChildCodeState, formData: FormData) => {
      const result = await revokeChildCodeAction(prev, formData);
      if (result.revoked) {
        setShown(null);
        setShowError(null);
        setNoCopy(false);
      }
      return result;
    },
    initial,
  );

  // Each action revalidates this page, so `access` is always the current truth.
  const hasCode = access.hasCode;
  const canShow = hasCode && access.viewable && !noCopy;

  return (
    <section className="mt-[var(--space-2xl)] border-t border-[var(--color-border)] pt-[var(--space-l)]">
      <h2 className="text-[length:var(--text-h3)]">Child access</h2>
      <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)]">
        {childName} can use a code to open their missions on their own.
      </p>

      {genState.error && <div className="mt-[var(--space-m)]"><FormError message={genState.error} /></div>}
      {revState.error && <div className="mt-[var(--space-m)]"><FormError message={revState.error} /></div>}
      {showError && !shown && <div className="mt-[var(--space-m)]"><FormError message={showError} /></div>}

      {shown && (
        <div className="mt-[var(--space-m)]">
          <RevealedCode
            code={shown.code}
            childName={childName}
            intro={shown.intro}
            viewable={shown.viewable}
          />
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
        {hasCode && !canShow && !shown && !showError && (
          <p className="text-[length:var(--text-small)]">{REPLACE_TO_VIEW}</p>
        )}
      </div>

      <div className="mt-[var(--space-m)] flex flex-wrap gap-[var(--space-s)]">
        {canShow && !shown && (
          <form action={show}>
            <input type="hidden" name="childId" value={childId} />
            <Button type="submit" isLoading={showing} loadingLabel="Showing…">
              Show access code
            </Button>
          </form>
        )}
        {shown && (
          <Button type="button" variant="secondary" onClick={() => setShown(null)}>
            Hide code
          </Button>
        )}

        {hasCode ? (
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            Generate new access code
          </Button>
        ) : (
          <form action={generate}>
            <input type="hidden" name="childId" value={childId} />
            <Button type="submit" isLoading={generating} loadingLabel="Making…">
              Create an access code
            </Button>
          </form>
        )}

        {hasCode && (
          <form action={revoke}>
            <input type="hidden" name="childId" value={childId} />
            <Button type="submit" variant="text" isLoading={revoking} loadingLabel="Turning off…">
              Turn off this code
            </Button>
          </form>
        )}
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Replace this access code?"
        role="alertdialog"
      >
        <ul className="wla-measure flex list-disc flex-col gap-[var(--space-xs)] pl-[var(--space-l)]">
          <li>The current code will stop working immediately.</li>
          <li>{childName} will be signed out on every device.</li>
          <li>You&rsquo;ll need to give {childName} the new code.</li>
        </ul>
        <div className="mt-[var(--space-l)] flex flex-wrap gap-[var(--space-s)]">
          {/* First, so the dialog's initial focus is on the safe choice. */}
          <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
            Keep the current code
          </Button>
          <form action={generate}>
            <input type="hidden" name="childId" value={childId} />
            <input type="hidden" name="confirmReplace" value="yes" />
            <Button type="submit" isLoading={generating} loadingLabel="Replacing…">
              Replace the code
            </Button>
          </form>
        </div>
      </Dialog>
    </section>
  );
}
