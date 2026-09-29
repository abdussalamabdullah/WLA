import { cn } from "@/lib/utils";
import type { MissionStatus } from "@/types/database";

/**
 * Architecture §4 / UI/UX §23 — status and its action are LOCKED.
 *
 * Status must NEVER be carried by colour alone (Architecture §20, Brief §11).
 * Hence: text label + shape marker + distinct action wording, all redundant.
 */

export const STATUS_LABEL: Record<MissionStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Complete",
};

/**
 * Locked pairing — Architecture §4, wording per the LMS brief §9 (D-65).
 *
 * The lock is that the action is derived from STATUS and never from the route
 * the learner arrived by. The words themselves were reconciled when the brief
 * and the locked table disagreed.
 */
export const STATUS_ACTION: Record<MissionStatus, string> = {
  not_started: "Start Mission",
  in_progress: "Continue Mission",
  complete: "View Mission",
};

const MARKER: Record<MissionStatus, string> = {
  not_started: "border-[var(--color-border-strong)] bg-transparent",
  in_progress: "border-[var(--color-primary)] bg-[var(--color-primary)]",
  complete: "border-[var(--color-primary)] bg-transparent",
};

export function MissionStatusBadge({
  status,
  className,
}: {
  status: MissionStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[var(--space-s)]",
        /*
         * Sentence case, not caps. The public site sets uppercase in exactly
         * one place — the 12px footer group headings — and nowhere in the
         * body of a page. Tracked-out caps at label size cost legibility for
         * an audience that includes seven-year-olds, and the hierarchy here
         * is already carried by size, weight and colour.
         */
        "text-[length:var(--text-small)] font-medium",
        "text-[var(--color-text-muted)]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-2.5 rounded-full border-2", MARKER[status])}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}
