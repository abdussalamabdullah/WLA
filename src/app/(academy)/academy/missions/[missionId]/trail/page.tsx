import Link from "next/link";
import { AcademyChrome } from "@/components/academy/academy-chrome";
import { notFound } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/system/states";
import { EvidenceItem } from "@/components/mission/evidence-item";
import { resolveActiveChild } from "@/features/children/active-child";
import { getMissionTrail } from "@/features/mission-trail/queries";
import { AccessError } from "@/lib/permissions";

export const metadata = { title: "Mission Trail" };

/**
 * MISSION TRAIL — Architecture §15, UI/UX §43–§45.
 *
 * The child's PRIVATE record of selected evidence. Not a profile, portfolio,
 * feed or file repository. UI/UX §45: it should read as "a quiet record of
 * practice, not a social feed" — hence a list, not a grid of tiles.
 *
 * No sharing controls: public Trail sharing is out of scope (PRD §5).
 */
export default async function MissionTrailPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;

  const active = await resolveActiveChild().catch(() => null);
  if (!active || active.status !== "ok") notFound();

  let trail;
  try {
    trail = await getMissionTrail(active.childId, missionId);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <ErrorState as="h1" title="We couldn't load this Mission Trail." />
      </main>
    );
  }

  return (
    <>
      <AcademyChrome />
      <main className="wla-container-narrow py-[var(--space-2xl)]">
        <Link
          href={`/academy/missions/${missionId}`}
          className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
        >
          ← {trail.missionTitle}
        </Link>

        <h1 className="mt-[var(--space-m)] text-[length:var(--text-h1)]">
          Mission Trail
        </h1>
        <p className="wla-measure mt-[var(--space-s)] text-[var(--color-text-muted)]">
          What you worked out, and what you kept. This is private to you.
        </p>

        {trail.evidence.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body="As you work through the mission, the things you decide and make will collect here."
          />
        ) : (
          <ul className="mt-[var(--space-xl)] border-t border-[var(--color-border)]">
            {trail.evidence.map(({ evidence, url }) => (
              <EvidenceItem key={evidence.id} evidence={evidence} url={url} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
