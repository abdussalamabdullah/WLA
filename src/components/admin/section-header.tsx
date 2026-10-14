import type { ReactNode } from "react";

/**
 * One builder section's heading: what the section is for in a sentence, and
 * — on request — a little more, with a link to the full Help entry.
 *
 * Progressive disclosure, not a tutorial: the one-line purpose is always
 * visible, everything else is behind "What is this?". Help opens in a new tab
 * so reading it never costs unsaved work.
 */
export function SectionHeader({
  id,
  title,
  purpose,
  more,
  helpAnchor,
  action,
}: {
  id: string;
  title: string;
  purpose: ReactNode;
  more?: ReactNode;
  /** An anchor on /admin/help. */
  helpAnchor?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-[var(--space-m)]">
      <div className="min-w-0 max-w-[46rem]">
        <h2 id={id} className="scroll-mt-[var(--space-xl)] text-[length:var(--text-h3)]">{title}</h2>
        <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)]">{purpose}</p>
        {(more || helpAnchor) && (
          <details className="mt-[2px]">
            <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4">
              What is this?<span className="sr-only"> — {title}</span>
            </summary>
            <div className="wla-measure pb-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              {more}
              {helpAnchor && (
                <p className="mt-[var(--space-xs)]">
                  <a
                    href={`/admin/help#${helpAnchor}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex min-h-[var(--target-min)] items-center underline decoration-[var(--color-border-strong)] underline-offset-4"
                  >
                    More in Help<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </p>
              )}
            </div>
          </details>
        )}
      </div>
      {action}
    </div>
  );
}
