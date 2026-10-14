import Link from "next/link";
import { printChecklist } from "@/features/admin/print-checklist";
import { notFound } from "next/navigation";
import { AdminPage, StatusTag, Td, DataTable } from "@/components/admin/admin-page";
import { BuilderWorkspace } from "@/components/admin/builder-workspace";
import { DetailsSummary, MissionStatusSummary, SectionIndex } from "@/components/admin/builder-overview";
import { CreateDraftButton } from "@/components/admin/create-draft-button";
import { UnsavedChangesProvider } from "@/components/admin/unsaved-changes";
import { requireAdmin } from "@/lib/permissions";
import {
  adminDraftScreens,
  adminDraftResources,
  adminDraftParentNote,
  adminMissionVersions,
  validateVersion,
  signDraftFiles,
  draftQaReport,
} from "@/features/admin/lms-queries";
import { getVersionUsage } from "@/features/admin/queries";
import { sectionStatuses, type BuilderFacts } from "@/features/admin/builder-readiness";
import { missionStatusLines, publishImpact } from "@/features/admin/mission-status";
import { LAB_LABEL } from "@/features/missions/labs";

export const metadata = { title: "Mission Builder" };

/**
 * ONE VERSION OF ONE MISSION — brief §11–§16.
 *
 * The eleven "steps" are sections of this page rather than a wizard. A wizard
 * suits a one-way process; authoring is not one. An author adds a screen,
 * discovers a branch needs somewhere to go, adds that, comes back. Forcing
 * that through ordered steps would mean leaving and re-entering constantly.
 * The section index (D-116) is the orientation a wizard would have given,
 * without the order.
 *
 * Screens are read through `admin_draft_screens`, which refuses on a published
 * or archived version — so this page cannot become a way to read live mission
 * content, which D-52 closed deliberately.
 */
export default async function BuilderVersionPage({
  params,
}: {
  params: Promise<{ slug: string; version: string }>;
}) {
  const { slug, version: versionParam } = await params;
  const version = Number(versionParam);
  if (!Number.isInteger(version) || version < 1) notFound();

  const { supabase } = await requireAdmin();

  const { data: mission } = await supabase
    .from("missions")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!mission) notFound();

  const { data: versionRow } = await supabase
    .from("mission_versions")
    // By column: the definition is read only through admin_draft_definition (D-61).
    .select("id, mission_id, version, status, completion_rule, notes, created_by, created_at, updated_at, submitted_at, published_at, archived_at")
    .eq("mission_id", mission.id)
    .eq("version", version)
    .maybeSingle();
  if (!versionRow) notFound();

  const editable = versionRow.status === "draft" || versionRow.status === "in_review";

  const [screens, resources, note, problems, qa, versions, usage] = await Promise.all([
    editable ? adminDraftScreens(mission.id, version) : Promise.resolve([]),
    editable ? adminDraftResources(mission.id, version) : Promise.resolve([]),
    editable ? adminDraftParentNote(mission.id, version) : Promise.resolve(null),
    validateVersion(mission.id, version),
    // Automated mission QA (Part 6) while authoring — drafts only: a published
    // version has no read path through the builder (D-61).
    editable ? draftQaReport(mission.id, version) : Promise.resolve(null),
    adminMissionVersions(mission.id),
    getVersionUsage(mission.id),
  ]);
  // Mission QA already read and signed this draft's media; reuse it.
  const assets = qa?.media ?? { rows: [], resolved: [] };
  const checklist = qa ? printChecklist(qa.model, resources.map((r) => ({ title: r.title, type: r.type, can_print: r.can_print }))) : null;
  const qaProblems = qa
    ? qa.issues.map((i) => ({ code: i.code, blocking: i.severity === "blocking", screen_key: i.screenKey, detail: i.detail, category: i.category as string }))
    : problems;

  const fileUrls = await signDraftFiles([
    ...resources.map((r) => r.storage_path),
    note?.document_path ?? "",
  ]);

  const blocking = qaProblems.filter((p) => p.blocking);
  const advisory = qaProblems.filter((p) => !p.blocking);
  const paths = (qa?.paths ?? []).map((p) => ({ decisions: p.decisions, screens: p.screens, outcome: p.outcome, detail: p.detail ?? null }));

  const versionList = versions.map((v) => ({ version: v.version, status: v.status as string }));
  const usageList = usage.map((u) => ({ version: u.version, runs: Number(u.runs), complete: Number(u.complete) }));
  const openDraft = versionList.find((v) => v.status === "draft" || v.status === "in_review")?.version ?? null;
  const statusLines = missionStatusLines({
    versions: versionList,
    catalogueVisible: mission.published,
    isFree: mission.is_free,
    priceMinor: mission.price_minor,
    editing: { version, status: versionRow.status },
  });

  const def = qa?.model.definition;
  const facts: BuilderFacts = {
    issues: qaProblems,
    screenCount: screens.length,
    resourceCount: resources.length,
    // The gate requires text (validate_mission_version `no_parent_note`); a PDF alone doesn't count.
    hasParentNote: Boolean(note?.content?.trim()),
    hasCompletion: Boolean(def?.completion || versionRow.completion_rule),
    logicInUse: def
      ? [def.variables, def.unlocks, def.events, def.variants, def.pools, def.checkpoints, def.prints, def.qr, def.workspaces].reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0)
      : 0,
    mediaCount: assets.rows.length,
    details: { description: mission.description, coverImage: mission.cover_image, priceMinor: mission.price_minor, isFree: mission.is_free },
    paths: { total: paths.length, complete: paths.filter((p) => p.outcome === "complete").length },
  };

  return (
    <UnsavedChangesProvider>
      <AdminPage
        title={mission.title}
        intro={`Version ${version}. ${
          editable
            ? "Changes here affect nobody until you publish."
            : "This version is locked. Create a new draft to make changes."
        }`}
        action={
          <div className="flex flex-wrap items-center gap-[var(--space-m)]">
            {editable && (
              <a
                href={`/admin/builder/${slug}/${version}/preview`}
                className="inline-flex min-h-[var(--target-min)] items-center rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-l)] text-[length:var(--text-label)] hover:border-[var(--color-border-strong)]"
              >
                Preview as a learner
              </a>
            )}
            <Link
              href={`/admin/missions/${slug}`}
              className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
            >
              ← Mission
            </Link>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-[var(--space-s)]">
          <StatusTag status={versionRow.status} />
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {editable ? `${screens.length || "No"} screen${screens.length === 1 ? "" : "s"}` : "Locked"}
          </span>
        </div>

        {!editable ? (
          <>
            <div className="mt-[var(--space-m)] max-w-[46rem]">
              <MissionStatusSummary lines={statusLines} />
            </div>
            <section className="mt-[var(--space-xl)] max-w-[46rem]">
              <h2 className="text-[length:var(--text-h3)]">Make changes</h2>
              <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)]">
                Children keep the version they started on, so a published version
                can&rsquo;t be rewritten underneath them.
              </p>
              <div className="mt-[var(--space-l)]">
                <CreateDraftButton missionId={mission.id} slug={slug} version={version} openDraft={openDraft} />
              </div>
            </section>
          </>
        ) : (
          <div className="mt-[var(--space-m)] grid gap-[var(--space-xl)] lg:grid-cols-[minmax(0,1fr)_17rem]">
            <aside className="lg:order-2">
              <SectionIndex statuses={sectionStatuses(facts)} />
            </aside>
            <div className="min-w-0 lg:order-1">
              <MissionStatusSummary lines={statusLines} />
              <DetailsSummary
                slug={slug}
                title={mission.title}
                description={mission.description}
                coverImage={mission.cover_image}
                priceMinor={mission.price_minor}
                currency={mission.currency}
                isFree={mission.is_free}
                catalogueVisible={mission.published}
                ages={`${mission.min_age}–${mission.max_age}`}
                lab={LAB_LABEL[mission.lab]}
              />
              <BuilderWorkspace
                missionId={mission.id}
                slug={slug}
                version={version}
                status={versionRow.status}
                completionRule={versionRow.completion_rule}
                screens={screens.map((s) => ({
                  screen_key: s.screen_key,
                  type: s.type,
                  title: s.title,
                  body: s.body,
                  sequence: s.sequence,
                  configuration: s.configuration,
                }))}
                blocking={blocking}
                paths={paths}
                definition={def ?? null}
                assets={assets}
                checklist={checklist}
                advisory={advisory}
                facts={facts}
                publishImpact={publishImpact({ version, versions: versionList, usage: usageList, catalogueVisible: mission.published })}
                resources={resources.map((r) => ({
                  id: r.id, title: r.title, description: r.description,
                  type: r.type, storage_path: r.storage_path,
                  can_view: r.can_view, can_print: r.can_print,
                  can_download: r.can_download, sort_order: r.sort_order,
                  file_url: fileUrls.get(r.storage_path) ?? null,
                }))}
                noteContent={note?.content ?? null}
                noteDocumentPath={note?.document_path ?? null}
                noteDocumentUrl={note?.document_path ? (fileUrls.get(note.document_path) ?? null) : null}
              />
            </div>
          </div>
        )}

        {!editable && problems.length > 0 && (
          <section className="mt-[var(--space-2xl)]">
            <h2 className="text-[length:var(--text-h3)]">Review notes</h2>
            <div className="mt-[var(--space-m)]">
              <DataTable caption="Review notes" columns={["Problem", "Screen", "Blocking"]}>
                {problems.map((p, i) => (
                  <tr key={i}>
                    <Td>{p.detail}</Td>
                    <Td>{p.screen_key ?? "—"}</Td>
                    <Td>{p.blocking ? "Yes" : "No"}</Td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </section>
        )}
      </AdminPage>
    </UnsavedChangesProvider>
  );
}
