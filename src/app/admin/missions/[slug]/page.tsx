import Link from "next/link";
import { notFound } from "next/navigation";
import { getMissionForEdit, getVersionUsage } from "@/features/admin/queries";
import { MissionForm } from "@/components/admin/mission-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: `Edit ${slug}` };
}

/**
 * Mission catalogue and detail editing (CMS-01).
 *
 * Screens are NOT editable here. Tech Spec §18: "We are not building a no-code
 * mission builder." Mission logic — screens, branches, completion rules — is
 * authored as reviewed seed SQL, and this page says so rather than leaving an
 * editor to wonder where it went.
 */
export default async function EditMissionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mission = await getMissionForEdit(slug);
  if (!mission) notFound();

  const versionUsage = await getVersionUsage(mission.id);

  return (
    <main className="wla-container-narrow py-[var(--space-2xl)] md:py-[var(--space-3xl)]">
      <Link
        href="/admin"
        className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
      >
        ← Missions
      </Link>

      <h1 className="mt-[var(--space-m)] text-[length:var(--text-h1)]">
        {mission.title}
      </h1>
      <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        {mission.slug} · version {mission.version}
      </p>

      <div className="mt-[var(--space-2xl)]">
        <MissionForm mission={mission} versionUsage={versionUsage} />
      </div>

      <hr className="wla-rule mt-[var(--space-section)]" />
      <p className="wla-measure mt-[var(--space-l)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Mission screens, branches and completion rules are not edited here. They
        are authored and reviewed as part of a mission build, so that a content
        change can never alter what a mission asks a child to decide.
      </p>
    </main>
  );
}
