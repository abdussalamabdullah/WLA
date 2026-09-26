"use client";

import { Button } from "@/components/ui/button";
import { MissionControl } from "@/components/mission/mission-control";
import { ErrorState } from "@/components/system/states";
import { cn } from "@/lib/utils";

/**
 * Shared frame for every mission screen.
 *
 * UI/UX §36 — a reusable screen has context, instruction, interaction and a
 * next action. Not every screen needs all four, so each part is optional.
 *
 * UI/UX §33: "The interface should get out of the way." One column, generous
 * measure, one obvious action.
 */
export function ScreenFrame({
  title,
  body,
  instruction,
  missionControl,
  error,
  children,
  action,
}: {
  title?: string | null;
  body?: string | null;
  instruction?: string;
  missionControl: { title: string; body: string }[];
  error?: string;
  children?: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[var(--space-l)]">
      {title && <h1 className="text-[length:var(--text-h1)]">{title}</h1>}

      {body && (
        <div className="wla-measure flex flex-col gap-[var(--space-m)] text-[length:var(--text-body)]">
          {body.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}

      {children}

      {/* The physical step. Always visible, never hover-dependent. */}
      {instruction && (
        <p className="wla-measure border-l-2 border-[var(--color-primary)] pl-[var(--space-m)] font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">
          {instruction}
        </p>
      )}

      {/* D-18 — a failed write keeps the child exactly where they are. */}
      {error && (
        <ErrorState
          title="That didn't save."
          body={`${error} Your place in the mission hasn't moved — try again.`}
        />
      )}

      <div className="flex flex-wrap items-center gap-[var(--space-l)] pt-[var(--space-s)]">
        {action}
        <MissionControl support={missionControl} />
      </div>
    </div>
  );
}

export function PrimaryAction({
  label,
  onClick,
  disabled,
  isPending,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  isPending?: boolean;
}) {
  return (
    <Button
      size="large"
      onClick={onClick}
      disabled={disabled}
      isLoading={isPending}
      loadingLabel="Saving…"
    >
      {label}
    </Button>
  );
}

/** A selectable card. Selection is never carried by colour alone (§23). */
export function SelectableOption({
  label,
  selected,
  onSelect,
  disabled,
  selectedLabel = "Chosen",
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  selectedLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start justify-between gap-[var(--space-m)]",
        "min-h-[var(--target-min)] rounded-[var(--radius-card)] border",
        "px-[var(--space-l)] py-[var(--space-m)] text-left",
        "transition-colors duration-[var(--duration-fast)]",
        "disabled:opacity-50",
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-surface-sage)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]",
      )}
    >
      <span>{label}</span>
      {selected && (
        <span className="shrink-0 text-[length:var(--text-label)] text-[var(--color-text-muted)]">
          {selectedLabel}
        </span>
      )}
    </button>
  );
}
