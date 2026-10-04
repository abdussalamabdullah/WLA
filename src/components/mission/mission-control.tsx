"use client";

import { useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useMissionContext, type SupportItem } from "./mission-context";

const KIND_LABEL: Record<string, string> = {
  check: "What to check",
  materials: "Your materials",
  reword: "In other words",
  recovery: "If something isn't working",
};

/**
 * MISSION CONTROL — Architecture §12, Brief §25, UI/UX §39–§40.
 *
 * Reusable support. It should feel "calm, available, optional, supportive,
 * secondary" and must NOT feel like "the answer, a reward, a rescue button or
 * a hint ladder".
 *
 * Behaviour locked by Architecture §12:
 *   - opens without advancing the mission
 *   - preserves the child's current state
 *   - closes back to the same point
 *   - shows only approved support
 *   - never reveals concealed information or solves the mission
 *
 * That is why this component takes no state setter and emits no events. It
 * CANNOT advance the mission, by construction — the only way to break that
 * rule would be to add a prop, which should be refused.
 *
 * Content is mission-specific and comes from the Mission Build Brief. None
 * exists yet, so `support` is supplied by the caller rather than invented here.
 */
export function MissionControl({
  support: legacy,
  triggerLabel = "Mission Control",
}: {
  support: { title: string; body: string }[];
  triggerLabel?: string;
}) {
  const ctx = useMissionContext();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(1);

  /*
   * Mission Control v2 (Enhancement Plan §8): support levels, smallest nudge
   * first. Legacy items (Six Names) are level 1, so Six Names shows exactly
   * what it always showed. Items arrive already filtered to this state by the
   * server's projection; nothing here can reveal or advance anything.
   */
  const support: SupportItem[] = [
    ...legacy.map((i) => ({ ...i, level: 1 })),
    ...ctx.support,
  ];
  const maxLevel = Math.max(1, ...support.map((i) => i.level ?? 1));
  const shown = support.filter((i) => (i.level ?? 1) <= level);

  // Available only where the mission specifies it (Architecture §12).
  if (support.length === 0) return null;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setLevel(1);
      ctx.report("mission_control_opened", { level: 1 });
    }
  }

  function moreHelp() {
    const next = Math.min(maxLevel, level + 1);
    setLevel(next);
    ctx.report("mission_control_opened", { level: next });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger
        className={cn(
          "inline-flex min-h-[var(--target-min)] items-center",
          "text-[length:var(--text-label)]",
          // Secondary by design — never competes with the primary action
          "text-[var(--color-text-muted)] underline",
          "decoration-[var(--color-border-strong)] underline-offset-4",
          "hover:text-[var(--color-text)]",
        )}
      >
        {triggerLabel}
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[rgb(58_47_42/0.24)]" />
        {/* Sheet on mobile, centred panel above it — §52 prefers sheets where
            they preserve context. The mission stays visible behind. */}
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto",
            "rounded-t-[var(--radius-dialog)] border-t border-[var(--color-border)]",
            "bg-[var(--color-surface)] p-[var(--space-l)]",
            "shadow-[var(--shadow-overlay)]",
            "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2",
            "sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:rounded-[var(--radius-dialog)] sm:border",
          )}
        >
          <Dialog.Title className="text-[length:var(--text-h3)]">
            Mission Control
          </Dialog.Title>
          <Dialog.Description className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Support if you want it. Your mission stays exactly where it is.
          </Dialog.Description>

          <div className="mt-[var(--space-l)] flex flex-col gap-[var(--space-l)]">
            {shown.map((item, i) => (
              <section key={i}>
                {item.kind && KIND_LABEL[item.kind] && (
                  <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{KIND_LABEL[item.kind]}</p>
                )}
                <h3 className="text-[length:var(--text-body)] font-medium">
                  {item.title}
                </h3>
                <p className="wla-measure mt-[var(--space-xs)] text-[var(--color-text-muted)]">
                  {item.body}
                </p>
                {item.audio && /^https?:\/\//.test(item.audio) && (
                  <audio controls preload="none" src={item.audio} aria-label={`Listen: ${item.title}`} className="mt-[var(--space-xs)] w-full" />
                )}
                {item.kind === "materials" && ctx.missionSlug && (
                  <Link
                    href={`/academy/missions/${ctx.missionSlug}/kit`}
                    className="mt-[var(--space-xs)] inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline underline-offset-4"
                  >
                    {item.resource ? `Open ${item.resource} in the Mission Kit` : "Open the Mission Kit"}
                  </Link>
                )}
              </section>
            ))}
          </div>

          {level < maxLevel && (
            <button
              type="button"
              onClick={moreHelp}
              className="mt-[var(--space-m)] inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
            >
              More help
            </button>
          )}

          <Dialog.Close
            className={cn(
              "mt-[var(--space-l)] inline-flex min-h-[var(--target-min)] items-center",
              "rounded-[var(--radius-button)] border border-[var(--color-border-strong)]",
              "px-[var(--space-l)] text-[length:var(--text-label)]",
            )}
          >
            Back to the mission
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
