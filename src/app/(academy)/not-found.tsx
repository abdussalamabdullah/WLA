import { ButtonLink } from "@/components/ui/button";

/**
 * Academy not-found — reached when a mission is missing OR the active child is
 * not entitled to it (Tech Spec §26: do not render the mission experience).
 *
 * The copy deliberately does not distinguish those two cases. Saying "you
 * don't have access to this mission" would confirm the mission exists, which
 * a stranger guessing slugs should not learn.
 */
export default function AcademyNotFound() {
  return (
    <main className="wla-container py-[var(--space-3xl)]">
      <h1 className="text-[length:var(--text-h1)]">
        We couldn&rsquo;t find that.
      </h1>
      <p className="wla-measure mt-[var(--space-m)] text-[var(--color-text-muted)]">
        It may have moved, or it may not be one of this child&rsquo;s missions.
      </p>
      <ButtonLink
        href="/academy/my-missions"
        className="mt-[var(--space-l)] inline-block"
      >
        Back to My Missions
      </ButtonLink>
    </main>
  );
}
