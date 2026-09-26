"use client";

import { useTransition } from "react";
import { switchActiveChildAction } from "@/features/children/actions";
import type { ChildOption } from "@/components/profile/profile-switcher";
import { cn } from "@/lib/utils";

/**
 * CHILD SELECTION — Architecture §3, UI/UX §18.
 *
 * "Where more than one child profile exists, the active child profile must be
 * clear before mission access." Shown in place of My Missions when nothing is
 * selected, so no mission data is rendered before the child is established.
 */
export function ChildSelection({
  childProfiles,
}: {
  childProfiles: ChildOption[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="py-[var(--space-2xl)]">
      <h1 className="text-[length:var(--text-h1)]">Whose missions?</h1>
      <p className="wla-measure mt-[var(--space-s)] text-[var(--color-text-muted)]">
        Choose a child to see the missions they can access.
      </p>

      <ul className="mt-[var(--space-xl)] grid gap-[var(--space-m)] sm:grid-cols-2 lg:grid-cols-3">
        {childProfiles.map((child) => (
          <li key={child.id}>
            <button
              onClick={() =>
                startTransition(() => switchActiveChildAction(child.id))
              }
              disabled={isPending}
              className={cn(
                "flex w-full items-center justify-between gap-[var(--space-m)]",
                "min-h-[72px] rounded-[var(--radius-card)]",
                "border border-[var(--color-border)] bg-[var(--color-surface)]",
                "px-[var(--space-l)] text-left",
                "transition-colors duration-[var(--duration-fast)]",
                "hover:border-[var(--color-border-strong)] disabled:opacity-60",
              )}
            >
              <span className="text-[length:var(--text-h3)]">
                {child.display_name}
              </span>
              <span aria-hidden>→</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
