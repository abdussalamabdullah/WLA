import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared chrome for every admin destination: one title, one line of
 *  explanation, then the thing itself. Copy comes from brief §25. */
export function AdminPage({
  title,
  intro,
  action,
  children,
}: {
  title: string;
  intro: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="wla-container py-[var(--space-2xl)]">
      <div className="flex flex-wrap items-start justify-between gap-[var(--space-m)]">
        <div>
          <h1 className="text-[length:var(--text-h1)]">{title}</h1>
          <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)]">
            {intro}
          </p>
        </div>
        {action}
      </div>
      <div className="mt-[var(--space-xl)]">{children}</div>
    </main>
  );
}

/**
 * A plain data table.
 *
 * Wrapped in a horizontal scroller rather than allowed to widen the page:
 * §27 forbids horizontal scrolling of the PAGE, and a table that cannot fit a
 * phone has to go somewhere. `tabindex` makes the scroller keyboard-reachable,
 * which is required once a region scrolls.
 */
export function DataTable({
  columns,
  children,
  caption,
}: {
  columns: string[];
  children: ReactNode;
  caption?: string;
}) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={caption ?? "Data table"}
      // `relative`: screen-reader-only text inside a cell is absolutely
      // positioned; without a positioned ancestor here it escaped the scroll
      // region and widened the whole page at 390px.
      className="relative -mx-[var(--space-m)] overflow-x-auto px-[var(--space-m)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] sm:mx-0 sm:px-0"
    >
      <table className="w-full min-w-[640px] border-collapse text-[length:var(--text-small)]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-[var(--color-border-strong)] text-left">
            {columns.map((c) => (
              <th key={c} scope="col" className="py-[var(--space-s)] pr-[var(--space-m)] font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cn("border-b border-[var(--color-border)] py-[var(--space-s)] pr-[var(--space-m)] align-top", className)}>
      {children}
    </td>
  );
}

/** Status text — never colour alone (Architecture §20). */
export function StatusTag({ status }: { status: string }) {
  const tone =
    status === "published" ? "bg-[var(--color-surface-sage)] border-[var(--color-border-strong)]"
    : status === "archived" ? "bg-[var(--color-surface)] border-[var(--color-border)] text-[color:var(--color-text-muted)]"
    : status === "in_review" ? "bg-[var(--color-surface-raised)] border-[var(--color-border-strong)]"
    : "bg-[var(--color-surface-raised)] border-[var(--color-border)]";
  const label =
    status === "in_review" ? "In Review"
    : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={cn("inline-block rounded-[var(--radius-control)] border px-[var(--space-xs)] py-[2px]", tone)}>
      {label}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-[var(--space-xs)] font-[family-name:var(--font-serif)] text-[length:var(--text-h1)] leading-none">
        {value}
      </p>
      {hint && <p className="mt-[var(--space-xs)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  );
}

/** Access-code status. Words, not only a colour (Architecture §20). */
export function CodeStatusTag({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-block rounded-[var(--radius-control)] border px-[var(--space-xs)] py-[2px]",
        active
          ? "border-[var(--color-border-strong)] bg-[var(--color-surface-sage)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[color:var(--color-text-muted)]",
      )}
    >
      {active ? "Active" : "None"}
    </span>
  );
}
