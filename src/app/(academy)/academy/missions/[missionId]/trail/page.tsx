import Link from "next/link";
import { AcademyShell } from "@/components/academy/academy-shell";
import { notFound } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/system/states";
import { EvidenceItem } from "@/components/mission/evidence-item";
import { LabIcon } from "@/components/mission/lab-icon";
import { getOffersFor } from "@/features/mission-board/board";
import { LAB_LABEL } from "@/features/missions/labs";
import { resolveAcademyActor } from "@/features/academy/actor";
import { getTrailFor } from "@/features/academy/play";
import { AccessError } from "@/lib/permissions";

export const metadata = { title: "Mission Trail" };

/**
 * MISSION TRAIL — Architecture §15, UI/UX §43–§45.
 *
 * The child's PRIVATE record of selected evidence. Not a profile, portfolio,
 * feed or file repository. UI/UX §45: it should read as "a quiet record of
 * practice, not a social feed" — hence a list, not a grid of tiles.
 *
 * No public sharing (PRD §5). The one way out is the moderated Mission Board
 * (D-73): an eligible entry may be OFFERED — with a parent's permission,
 * anonymised, and reviewed by WLA before anyone sees it.
 */
export default async function MissionTrailPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;

  const actor = await resolveAcademyActor();
  if (actor.kind !== "parent" && actor.kind !== "child") notFound();

  let trail;
  try {
    trail = await getTrailFor(actor, missionId);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <ErrorState as="h1" title="We couldn't load this Mission Trail." />
      </main>
    );
  }

  // Outside the try — notFound() throws, and the catch would swallow it.
  if (!trail) notFound();
  const offers = await getOffersFor(actor).catch(() => new Map());

  return (
    <AcademyShell>
      <main className="wla-container-narrow py-[var(--space-2xl)]">
        <Link
          href={`/academy/missions/${missionId}`}
          className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
        >
          ← {trail.missionTitle}
        </Link>

        <p className="mt-[var(--space-m)] flex items-center gap-[var(--space-xs)] text-[length:var(--text-label)] text-[var(--color-text-muted)]">
          <LabIcon lab={trail.lab} size={18} />
          {LAB_LABEL[trail.lab]}
        </p>
        <h1 className="mt-[var(--space-xs)] text-[length:var(--text-h1)]">
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
            {trail.evidence.map(({ evidence, url }) => {
              const rel = evidence.related_to ? trail.evidence.find((e) => e.evidence.id === evidence.related_to)?.evidence : null;
              return (
                <EvidenceItem key={evidence.id} evidence={evidence} url={url}
                  related={rel ? { id: rel.id, title: rel.title } : null}
                  board={{ status: offers.get(evidence.id) ?? null, actor: actor.kind === "child" ? "child" : "parent", missionSlug: missionId }} />
              );
            })}
          </ul>
        )}
      </main>
    </AcademyShell>
  );
}
