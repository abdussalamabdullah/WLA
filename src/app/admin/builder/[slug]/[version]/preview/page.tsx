import { notFound } from "next/navigation";
import { MissionPreview } from "@/components/admin/mission-preview";
import { requireAdmin } from "@/lib/permissions";
import { adminDraftAssets, adminDraftScreens } from "@/features/admin/lms-queries";

export const metadata = { title: "Preview" };

/**
 * PREVIEW A DRAFT AS A LEARNER — brief §6.
 *
 * Deliberately OUTSIDE the admin shell: a sidebar of nine admin destinations
 * beside a mission screen would be the opposite of previewing what a child
 * sees. The preview frame replaces it and says plainly that nothing is saved.
 *
 * Screens come from `admin_draft_screens`, which refuses unless the caller is
 * an admin and the version is draft or in review — so this route is not a way
 * to read published content (D-61). A published version has no preview because
 * the honest way to see one is to play it.
 */
export default async function PreviewPage({
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
    .select("id, slug, title")
    .eq("slug", slug)
    .maybeSingle();
  if (!mission) notFound();

  const { data: versionRow } = await supabase
    .from("mission_versions")
    .select("version, status, completion_rule")
    .eq("mission_id", mission.id)
    .eq("version", version)
    .maybeSingle();
  if (!versionRow) notFound();

  // Preview is for work in progress. A published or archived version is not
  // previewable, and admin_draft_screens would refuse anyway.
  if (versionRow.status !== "draft" && versionRow.status !== "in_review") {
    notFound();
  }

  const [screens, { data: definition }, media] = await Promise.all([
    adminDraftScreens(mission.id, version),
    // Draft-only (D-61): the same RPC refuses a published version.
    supabase.rpc("admin_draft_definition", { p_mission_id: mission.id, p_version: version }),
    adminDraftAssets(mission.id, version),
  ]);

  return (
    <MissionPreview
      missionTitle={mission.title}
      missionSlug={mission.slug}
      version={version}
      backHref={`/admin/builder/${slug}/${version}`}
      completionRule={versionRow.completion_rule}
      definition={definition ?? {}}
      assets={media.resolved}
      screens={screens.map((s) => ({
        screenKey: s.screen_key,
        type: s.type,
        title: s.title,
        body: s.body,
        sequence: s.sequence,
        configuration: s.configuration,
      }))}
    />
  );
}
