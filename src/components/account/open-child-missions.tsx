"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchActiveChildAction } from "@/features/children/actions";

/**
 * Child switching from the account area — Enhancement Plan §1.
 *
 * Uses the same server action as the Academy switcher, which re-verifies that
 * the child belongs to this parent before writing the active-child cookie. The
 * id here is a convenience, never authority.
 */
export function OpenChildMissions({ childId, name }: { childId: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await switchActiveChildAction(childId);
          router.push("/academy/my-missions");
        })
      }
      className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)] disabled:opacity-60"
    >
      {pending ? "Opening…" : `Open ${name}'s missions`}
    </button>
  );
}
