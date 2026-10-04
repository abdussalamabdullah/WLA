import Link from "next/link";
import { notFound } from "next/navigation";
import { getMissionForEdit, getVersionUsage } from "@/features/admin/queries";
import { adminMissionVersions } from "@/features/admin/lms-queries";
import { MissionForm } from "@/components/admin/mission-form";
import { AdminPage, DataTable, Td, StatusTag } from "@/components/admin/admin-page";
import { VersionActions, DeleteMissionPanel, RestoreVersionButton, DuplicateMissionPanel } from "@/components/admin/version-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: `Manage ${slug}` };
}

/**
 * Mission detail — catalogue fields, plus the version lifecycle (D-57).
 *
 * The form above edits PRESENTATION: title, description, price, age band,
 * cover. None of it is structural, so it is safe to change on a live mission
 * and is not versioned.
 *
 * The table below is STRUCTURE: screens, branches and completion, which live
 * per version and become immutable on publication. The two are separated on
 * purpose — the most common authoring mistake this design prevents is
 * believing that fixing a typo in a description requires a new version, or
 * that rewording a decision does not.
 */
export default async function EditMissionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mission = await getMissionForEdit(slug);
  if (!mission) notFound();

  const [versions, versionUsage] = await Promise.all([
    adminMissionVersions(mission.id),
    getVersionUsage(mission.id),
  ]);
  const hasEditableDraft = versions.some(
    (v) => v.status === "draft" || v.status === "in_review",
  );
  const totalRuns = versions.reduce((n, v) => n + Number(v.runs), 0);

  return (
    <AdminPage
      title={mission.title}
      intro={`${mission.slug} · currently serving version ${mission.version} to new learners.`}
      action={
        <Link
          href="/admin/missions"
          className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
        >
          ← Missions
        </Link>
      }
    >
      <section className="max-w-[40rem]">
        <h2 className="text-[length:var(--text-h3)]">Details</h2>
        <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          How the mission is described and sold. Changing any of this is safe
          for children already playing.
        </p>
        <div className="mt-[var(--space-l)]">
          <MissionForm mission={mission} versionUsage={versionUsage} />
        </div>
      </section>

      <section className="mt-[var(--space-3xl)]">
        <h2 className="text-[length:var(--text-h3)]">Versions</h2>
        <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Screens, decisions, branches and completion. A published version is
          locked; children keep the version they started on.
        </p>

        <div className="mt-[var(--space-l)]">
          <DataTable
            caption="Mission versions"
            columns={["Version", "Status", "Screens", "Runs", "Completed", "Published", ""]}
          >
            {versions.map((v) => (
              <tr key={v.version}>
                <Td>v{v.version}</Td>
                <Td><StatusTag status={v.status} /></Td>
                <Td>{v.screens}</Td>
                <Td>{v.runs}</Td>
                <Td>{v.complete}</Td>
                <Td>
                  {v.published_at
                    ? new Date(v.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                    : "—"}
                </Td>
                <Td>
                  <Link
                    href={`/admin/builder/${slug}/${v.version}`}
                    className="inline-flex min-h-[var(--target-min)] items-center underline decoration-[var(--color-border-strong)] underline-offset-4"
                  >
                    {v.status === "draft" || v.status === "in_review" ? "Edit" : "View"}
                  </Link>
                  {(v.status === "published" || v.status === "archived") && (
                    <> · <RestoreVersionButton missionId={mission.id} slug={slug} version={v.version} disabled={hasEditableDraft} /></>
                  )}
                </Td>
              </tr>
            ))}
          </DataTable>
        </div>

        <VersionActions
          missionId={mission.id}
          slug={slug}
          hasEditableDraft={hasEditableDraft}
          publishedVersion={
            versions.find((v) => v.status === "published")?.version ?? null
          }
        />
      </section>

      <section className="mt-[var(--space-3xl)] max-w-[40rem]">
        <h2 className="text-[length:var(--text-h3)]">Delete this mission</h2>
        <div className="mt-[var(--space-m)]">
          <div className="mb-[var(--space-l)]">
            <DuplicateMissionPanel missionId={mission.id} title={mission.title} />
          </div>
          <DeleteMissionPanel missionId={mission.id} totalRuns={totalRuns} />
        </div>
      </section>
    </AdminPage>
  );
}
