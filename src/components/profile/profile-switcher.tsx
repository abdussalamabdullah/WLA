"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { switchActiveChildAction } from "@/features/children/actions";
import { cn } from "@/lib/utils";

/**
 * CHILD PROFILE SWITCHER — UI/UX §18–§19, Architecture §3.
 *
 * "The experience should feel family-oriented rather than like social-profile
 * management" and "should not dominate the screen" (§19). So: a quiet control
 * showing whose missions are on screen, opening a small dialog.
 *
 * §18: "Do not overemphasise the child's profile image or identity. The
 * important information is: which child's missions am I looking at?"
 */

export type ChildOption = { id: string; display_name: string };

export function ProfileSwitcher({
  childProfiles,
  activeChildId,
}: {
  childProfiles: ChildOption[];
  activeChildId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const active = childProfiles.find((c) => c.id === activeChildId);

  // Single child: a compact indicator, no switching affordance (§19).
  if (childProfiles.length <= 1) {
    return active ? (
      <span className="text-[length:var(--text-label)] text-[var(--color-text-muted)]">
        {active.display_name}
      </span>
    ) : null;
  }

  function select(id: string) {
    startTransition(async () => {
      await switchActiveChildAction(id);
      setOpen(false);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={cn(
          "inline-flex min-h-[var(--target-min)] items-center gap-[var(--space-s)]",
          "rounded-[var(--radius-button)] px-[var(--space-m)]",
          "text-[length:var(--text-label)]",
          "border border-[var(--color-border-strong)]",
          "hover:bg-[var(--color-surface)]",
          "transition-colors duration-[var(--duration-fast)]",
        )}
      >
        <span>
          {active ? `${active.display_name}'s Missions` : "Choose a child"}
        </span>
        <span aria-hidden>⌄</span>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[rgb(58_47_42/0.32)]" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 w-[min(28rem,calc(100vw-2rem))]",
            "-translate-x-1/2 -translate-y-1/2",
            "rounded-[var(--radius-dialog)] border border-[var(--color-border)]",
            "bg-[var(--color-surface)] p-[var(--space-l)]",
            "shadow-[var(--shadow-overlay)]",
          )}
        >
          <Dialog.Title className="text-[length:var(--text-h3)]">
            Whose missions?
          </Dialog.Title>
          <Dialog.Description className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Choose which child&rsquo;s missions to show.
          </Dialog.Description>

          <ul className="mt-[var(--space-l)] flex flex-col gap-[var(--space-s)]">
            {childProfiles.map((child) => {
              const isActive = child.id === activeChildId;
              return (
                <li key={child.id}>
                  <button
                    onClick={() => select(child.id)}
                    disabled={isPending}
                    // Selection is announced, not just shown (§62, §23)
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center justify-between gap-[var(--space-m)]",
                      "min-h-[var(--target-min)] rounded-[var(--radius-card)]",
                      "border px-[var(--space-m)] py-[var(--space-sm)] text-left",
                      "transition-colors duration-[var(--duration-fast)]",
                      "disabled:opacity-60",
                      isActive
                        ? "border-[var(--color-primary)] bg-[var(--color-surface-sage)]"
                        : "border-[var(--color-border)] hover:bg-[var(--color-background)]",
                    )}
                  >
                    <span>{child.display_name}</span>
                    {/* Text, not colour alone — Architecture §20 */}
                    {isActive && (
                      <span className="text-[length:var(--text-label)] text-[var(--color-text-muted)]">
                        Selected
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
