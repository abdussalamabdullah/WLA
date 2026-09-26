import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState } from "@/components/system/states";
import { ParentNote } from "@/components/academy/parent-note";
import { resolveActiveChild } from "@/features/children/active-child";
import { getMissionHome } from "@/features/missions/queries";
import { AccessError } from "@/lib/permissions";

export const metadata = { title: "For Parents" };

/**
 * FOR PARENTS — Architecture §8 (LOCKED), UI/UX §32.
 *
 * Adult guidance, separate from Mission Kit. Not a parent dashboard.
 * Opening it must not change mission state — this route performs no writes.
 * Narrow measure: this is a document to read, not a screen to operate.
 */
export default async function ForParentsPage({
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
      <main className="wla-container-narrow py-[var(--space-2xl)]">
        <ErrorState title="We couldn't load this note." />
      </main>
    );
  }

  return (
    <main className="wla-container-narrow py-[var(--space-2xl)]">
      <Link
        href={`/academy/missions/${home.mission.slug}`}
        className="text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
      >
        ← {home.mission.title}
      </Link>

      <h1 className="mt-[var(--space-m)] text-[length:var(--text-h1)]">
        For Parents
      </h1>

      <div className="mt-[var(--space-l)]">
        <ParentNote content={home.parentNote} />
      </div>
    </main>
  );
}
