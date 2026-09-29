import Link from "next/link";
import { AcademyShell } from "@/components/academy/academy-shell";
import { notFound, redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { resolveAcademyActor } from "@/features/academy/actor";
import { getMissionHomeFor } from "@/features/academy/collection";
import { AccessError } from "@/lib/permissions";

export const metadata = { title: "Mission Complete" };

/**
 * MISSION COMPLETE — Architecture §14, Brief §26, UI/UX §42.
 *
 * "Closure + evidence, not performance."
 *
 * EXPLICITLY FORBIDDEN here: confetti, scores, points, badges, streaks,
 * leaderboards, reward animation — and any upsell, which Architecture §14
 * says must never block completion.
 *
 * Architecture §14 requires: Complete status, Mission Home still reachable,
 * Mission Kit still reachable, relevant Trail information surfaced, and a
 * clear return to My Missions.
 */
export default async function MissionCompletePage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;

  const actor = await resolveAcademyActor();
  if (actor.kind !== "parent" && actor.kind !== "child") notFound();

  let home;
  try {
    home = await getMissionHomeFor(actor, missionId);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }
  if (!home) notFound();

  const base = `/academy/missions/${home.mission.slug}`;

  /*
   * Closure is earned by STATUS, never by the route (D-65). Found in staging
   * QA: an In Progress child who opened /complete was told "You finished
   * something". Outside the try above — redirect() throws by design.
   */
  if (home.status !== "complete") redirect(base);

  return (
    <AcademyShell>
      <main className="wla-container-narrow py-[var(--space-3xl)] md:py-[var(--space-5xl)]">
        <p className="text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)]">
          Complete
        </p>

        {/*
          THE ONE SCREEN THAT EARNS DISPLAY TYPE.
          The site's 60px Fraunces belongs to its public hero; inside the
          Academy nothing else is loud, which is what leaves room for this to
          be. Closure is the moment worth setting large — and setting the
          CHILD'S MISSION large, rather than the word "Complete", keeps the
          emphasis on what they did instead of on the system noticing.
        */}
        <h1 className="wla-display mt-[var(--space-s)]">
          {home.mission.title}
        </h1>

        {/*
          Fraunces italic in olive, as the public site closes its home page.
          Brief §26 and UI/UX §42: closure and evidence, never performance —
          so this is a sentence, not a celebration.
        */}
        <p className="wla-editorial wla-measure mt-[var(--space-l)] text-[length:var(--text-h3)] leading-[var(--leading-normal)]">
          You finished something. What you worked out is yours to keep.
        </p>

        {/*
          One button, not two. The public site puts a single olive pill on a
          page and makes every other action a text link; two large buttons
          side by side would make the return and the Trail read as equal
          choices, which Architecture §14 does not intend.
        */}
        <div className="mt-[var(--space-2xl)] flex flex-wrap items-center gap-[var(--space-l)]">
          {/* Architecture §14 — the primary return */}
          <ButtonLink href="/academy/my-missions" size="large">
            Back to My Missions →
          </ButtonLink>
          <Link
            href={`${base}/trail`}
            className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
          >
            View Mission Trail →
          </Link>
        </div>

        <hr className="wla-rule mt-[var(--space-2xl)]" />

        <p className="mt-[var(--space-l)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          <Link
            href={base}
            className="underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
          >
            Return to Mission Home
          </Link>{" "}
          whenever you like. Your Mission Kit and parent note stay there.
        </p>
      </main>
    </AcademyShell>
  );
}
