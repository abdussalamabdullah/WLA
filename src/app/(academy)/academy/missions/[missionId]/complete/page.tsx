import Link from "next/link";
import { AcademyChrome } from "@/components/academy/academy-chrome";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resolveActiveChild } from "@/features/children/active-child";
import { getMissionHome } from "@/features/missions/queries";
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

  const active = await resolveActiveChild().catch(() => null);
  if (!active || active.status !== "ok") notFound();

  let home;
  try {
    home = await getMissionHome(active.childId, missionId);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    throw error;
  }

  const base = `/academy/missions/${home.mission.slug}`;

  return (
    <>
      <AcademyChrome />
      <main className="wla-container-narrow py-[var(--space-3xl)]">
      <p className="text-[length:var(--text-label)] tracking-wide text-[var(--color-text-muted)] uppercase">
        Complete
      </p>
      <h1 className="mt-[var(--space-s)] text-[length:var(--text-h1)]">
        {home.mission.title}
      </h1>
      <p className="wla-measure mt-[var(--space-m)] text-[length:var(--text-body-lg)]">
        You finished something. What you worked out is yours to keep.
      </p>

      <div className="mt-[var(--space-xl)] flex flex-wrap gap-[var(--space-m)]">
        {/* Architecture §14 — the primary return */}
        <Link href="/academy/my-missions">
          <Button size="large">Back to My Missions</Button>
        </Link>
        <Link href={`${base}/trail`}>
          <Button variant="secondary" size="large">
            View Mission Trail
          </Button>
        </Link>
      </div>

      <p className="mt-[var(--space-xl)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        <Link
          href={base}
          className="underline decoration-[var(--color-border-strong)] underline-offset-4"
        >
          Return to Mission Home
        </Link>{" "}
        — your Mission Kit and parent note stay there.
      </p>
      </main>
    </>
  );
}
