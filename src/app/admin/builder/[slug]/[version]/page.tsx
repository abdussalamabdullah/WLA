import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPage, StatusTag, Td, DataTable } from "@/components/admin/admin-page";
import { BuilderWorkspace } from "@/components/admin/builder-workspace";
import { requireAdmin } from "@/lib/permissions";
import {
  adminDraftScreens,
  adminDraftResources,
  adminDraftParentNote,
  validateVersion,
  signDraftFiles,
  draftQaReport,
} from "@/features/admin/lms-queries";

export const metadata = { title: "Mission Builder" };

/**
 * ONE VERSION OF ONE MISSION — brief §11–§16.
 *
 * The eleven "steps" are sections of this page rather than a wizard. A wizard
 * suits a one-way process; authoring is not one. An author adds a screen,
 * discovers a branch needs somewhere to go, adds that, comes back. Forcing
 * that through ordered steps would mean leaving and re-entering constantly.
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

  const [screens, resources, note, problems, qa] = await Promise.all([
    editable ? adminDraftScreens(mission.id, version) : Promise.resolve([]),
    editable ? adminDraftResources(mission.id, version) : Promise.resolve([]),
    editable ? adminDraftParentNote(mission.id, version) : Promise.resolve(null),
    validateVersion(mission.id, version),
    // Automated mission QA (Part 6) while authoring — drafts only: a published
    // version has no read path through the builder (D-61).
    editable ? draftQaReport(mission.id, version) : Promise.resolve(null),
  ]);
  const qaProblems = qa
    ? qa.issues.map((i) => ({ code: i.code, blocking: i.severity === "blocking", screen_key: i.screenKey, detail: i.detail }))
    : problems;

  const fileUrls = await signDraftFiles([
    ...resources.map((r) => r.storage_path),
    note?.document_path ?? "",
  ]);

  const blocking = qaProblems.filter((p) => p.blocking);
  const advisory = qaProblems.filter((p) => !p.blocking);
  const paths = (qa?.paths ?? []).map((p) => ({ decisions: p.decisions, screens: p.screens, outcome: p.outcome, detail: p.detail ?? null }));

  return (
    <AdminPage
      title={mission.title}
      intro={`Version ${version}. ${
        editable
          ? "Changes here affect nobody until you publish."
          : "This version is locked. Create a new version to make changes."
      }`}
      action={
        <Link
          href={`/admin/missions/${slug}`}
          className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
        >
          ← Mission
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-[var(--space-s)]">
        <StatusTag status={versionRow.status} />
        <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {screens.length || "No"} screen{screens.length === 1 ? "" : "s"}
        </span>
      </div>

      {!editable ? (
        <section className="mt-[var(--space-xl)]">
          <p className="wla-measure text-[var(--color-text-muted)]">
            Children keep the version they started on, so a published version
            can&rsquo;t be rewritten underneath them.
          </p>
          <div className="mt-[var(--space-l)]">
            <Link
              href={`/admin/missions/${slug}`}
              className="inline-flex min-h-[var(--target-min)] items-center rounded-[var(--radius-button)] bg-[var(--color-primary)] px-[var(--space-l)] text-[length:var(--text-label)] font-medium text-[color:var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
            >
              Create a new version
            </Link>
          </div>
        </section>
      ) : (
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
          definition={qa?.model.definition ?? null}
          advisory={advisory}
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
  );
}
