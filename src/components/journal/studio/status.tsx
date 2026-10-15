import { STATUS_LABEL, type DisplayStatus } from "@/features/journal/status";
import { cn } from "@/lib/utils";

/**
 * An editorial status in words, with a border/fill as a secondary cue only —
 * never colour alone (Architecture §20). A published article with a newer
 * version in progress says both.
 */
export function JournalStatus({ status, pending }: { status: DisplayStatus; pending?: DisplayStatus | null }) {
  const tone =
    status === "published" ? "bg-[var(--color-surface-sage)] border-[var(--color-border-strong)]"
    : status === "archived" ? "bg-[var(--color-surface)] border-[var(--color-border)] text-[color:var(--color-text-muted)]"
    : status === "changes_requested" ? "bg-[var(--color-surface)] border-[var(--color-error)]"
    : "bg-[var(--color-surface-raised)] border-[var(--color-border-strong)]";
  return (
    <span className="inline-flex flex-wrap items-center gap-[var(--space-xs)]">
      <span className={cn("inline-block rounded-[var(--radius-control)] border px-[var(--space-xs)] py-[2px]", tone)}>{STATUS_LABEL[status]}</span>
      {pending && pending !== status && (
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">New version: {STATUS_LABEL[pending].toLowerCase()}</span>
      )}
    </span>
  );
}
