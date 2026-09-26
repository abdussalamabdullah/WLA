import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, ErrorState } from "@/components/system/states";
import { ResourceItem } from "@/components/mission/resource-item";
import { resolveActiveChild } from "@/features/children/active-child";
import { getMissionHome } from "@/features/missions/queries";
import { AccessError } from "@/lib/permissions";

export const metadata = { title: "Mission Kit" };

/**
 * MISSION KIT — Architecture §7 (LOCKED), UI/UX §29–§31.
 *
 * What WLA GIVES the child. Never the child's own evidence — that is Mission
 * Trail, and Brief §17 requires the two never collapse into one "files" area.
 *
 * HARD RULE: this route performs NO writes. Opening, printing or downloading
 * a resource must not alter mission progress (Architecture §7).
 *
 * Available in every status, including Complete.
 */
export default async function MissionKitPage({
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
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <ErrorState title="We couldn't load the Mission Kit." />
      </main>
    );
  }

  const { mission, resources } = home;

  return (
    <main className="wla-container py-[var(--space-2xl)]">
      <Link
        href={`/academy/missions/${mission.slug}`}
        className="text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
      >
        ← {mission.title}
      </Link>

      <h1 className="mt-[var(--space-m)] text-[length:var(--text-h1)]">
        Mission Kit
      </h1>
      <p className="wla-measure mt-[var(--space-s)] text-[var(--color-text-muted)]">
        Everything WLA provides for this mission. These stay here before, during
        and after.
      </p>

      {resources.length === 0 ? (
        <EmptyState
          title="No materials for this mission"
          body="This mission doesn't need anything printed."
        />
      ) : (
        <ul className="mt-[var(--space-xl)] border-t border-[var(--color-border)]">
          {resources.map((resource) => (
            // url is null until signed-URL issuance lands in Sprint 4.
            <ResourceItem key={resource.id} resource={resource} url={null} />
          ))}
        </ul>
      )}
    </main>
  );
}
