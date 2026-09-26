/**
 * PARENT NOTE — Architecture §8, UI/UX §32.
 *
 * Adult-facing guidance, separate from Mission Kit. Must NOT become a parent
 * dashboard (Brief §18), and opening it must not change mission state — so
 * this is a pure render with no side effects.
 *
 * Remains available before, during and after completion.
 */
export function ParentNote({ content }: { content: string | null }) {
  if (!content) {
    return (
      <p className="text-[var(--color-text-muted)]">
        No parent note is available for this mission.
      </p>
    );
  }

  return (
    <article className="wla-measure leading-[var(--leading-relaxed)] whitespace-pre-line">
      {content}
    </article>
  );
}
