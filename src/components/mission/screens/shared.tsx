"use client";

import { Button } from "@/components/ui/button";
import { MissionControl } from "@/components/mission/mission-control";
import { ErrorState } from "@/components/system/states";
import { cn } from "@/lib/utils";
import { useMissionContext } from "@/components/mission/mission-context";
import { MediaBlocks } from "@/components/mission/media-blocks";
import { MissionTimer } from "@/components/mission/mission-timer";

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
  const { notice, media, timer, prints, missionSlug, mode } = useMissionContext();
  return (
    <div className="flex flex-col gap-[var(--space-l)]">
      {/*
        h2, not h1 (WCAG 1.3.1 / 2.4.6).

        The page's h1 is the mission itself, rendered once by Active Mission —
        which matters because several screens legitimately have NO title at
        all: every handoff, and every reflection. Those pages previously had no
        h1 anywhere, so a screen-reader user navigating by heading had nothing
        to land on. Making the mission the h1 gives every screen a top level,
        whether or not the screen names itself.
      */}
      {title && <h2 className="text-[length:var(--text-h1)]">{title}</h2>}

      {body && (
        <div className="wla-measure flex flex-col gap-[var(--space-m)] text-[length:var(--text-body)]">
          {body.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}

      {timer && <MissionTimer seconds={timer.seconds} visible={timer.visible} onExpire={timer.onExpire} />}

      <MediaBlocks blocks={media} />

      {children}

      {/* Printables made for this run (Plan §5): a new tab, never a step. */}
      {prints && prints.length > 0 && (
        <ul className="flex flex-col gap-[var(--space-xs)]">
          {prints.map((p) => (
            <li key={p.key}>
              {mode === "preview" ? (
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Print: {p.title} (made for the learner&rsquo;s own run)</span>
              ) : (
                <a href={`/api/print/${encodeURIComponent(missionSlug)}/${encodeURIComponent(p.key)}`} target="_blank" rel="noreferrer"
                  className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4">
                  Print: {p.title}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {/*
        The physical step. Always visible, never hover-dependent.

        Set in Fraunces SEMIBOLD, which is the role the public site gives to
        short editorial statements — "Six names appear on a list, but what the
        list means is not clear." That is exactly what this line is: the one
        sentence telling the child what to go and do. Regular weight left it
        reading as another heading.
      */}
      {instruction && (
        <p className="wla-measure border-l-2 border-[var(--color-primary)] pl-[var(--space-m)] font-[family-name:var(--font-serif)] text-[length:var(--text-h3)] font-[var(--weight-semibold)]">
          {instruction}
        </p>
      )}

      {/*
        Input the mission did not accept (D-78): guidance, not an error. It
        names what to do; it never says "wrong" (Brief §10).
      */}
      {notice && (
        <p role="status" className="wla-measure border-l-2 border-[var(--color-accent)] pl-[var(--space-m)]">
          <span className="sr-only">Not yet: </span>{notice}
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
  description,
  selected,
  onSelect,
  disabled,
  selectedLabel = "Chosen",
}: {
  label: string;
  /** The response in full, under its short label. */
  description?: string;
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
      {/*
        Every option gets the same structure, weight and spacing whether or not
        it carries a description — the Build Brief requires that no response
        look preferred, and uneven emphasis is the easiest way to break that.
      */}
      <span className="flex flex-col gap-[var(--space-xs)]">
        <span className="font-medium">{label}</span>
        {description && (
          <span className="text-[var(--color-text-muted)]">{description}</span>
        )}
      </span>
      {selected && (
        <span className="shrink-0 text-[length:var(--text-label)] text-[var(--color-text-muted)]">
          {selectedLabel}
        </span>
      )}
    </button>
  );
}
