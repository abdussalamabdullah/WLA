import "server-only";

import { requireEntitledMission, requireOwnedChild, requireParent } from "@/lib/permissions";
import { listChildren } from "@/features/children/queries";
import type {
  MissionProgressRow,
  MissionResourceRow,
  MissionRow,
  MissionStatus,
} from "@/types/database";

/** A mission as My Missions needs it: identity + this child's status. */
export type MissionCollectionItem = {
  mission: MissionRow;
  status: MissionStatus;
  lastActivityAt: string | null;
};

/**
 * The child's mission collection (Architecture §4).
 *
 * Driven by entitlement, not by catalogue: a mission the child is not entitled
 * to cannot appear here. Access is asked as "does this child have valid
 * access?" — never "why did they receive it?", so free, purchased, gifted and
 * redeemed entitlements are treated identically (client instruction).
 */
export async function getMissionCollection(
  childId: string,
): Promise<MissionCollectionItem[]> {
  const { child, supabase } = await requireOwnedChild(childId);

  const { data: entitlements } = await supabase
    .from("mission_entitlements")
    .select("mission_id, missions(*)")
    .eq("child_id", child.id)
    .eq("status", "active");

  if (!entitlements?.length) return [];

  const { data: progressRows } = await supabase
    .from("mission_progress")
    .select("mission_id, status, last_activity_at")
    .eq("child_id", child.id);

  return buildCollection(entitlements, progressRows ?? []);
}

type EntitlementRow = { mission_id: string; missions: unknown };
type ProgressSummary = { mission_id: string; status: string; last_activity_at: string | null };

/** One child's collection from their entitlement and progress rows, in My Missions order. */
function buildCollection(entitlements: EntitlementRow[], progressRows: ProgressSummary[]): MissionCollectionItem[] {
  const progressByMission = new Map(
    progressRows.map((p) => [p.mission_id, p]),
  );

  const collection = entitlements
    .map((e) => {
      const mission = e.missions as unknown as MissionRow | null;
      if (!mission) return null;
      const progress = progressByMission.get(e.mission_id);
      return {
        mission,
        // No progress row yet is a legitimate "Not Started" (Architecture §4).
        status: (progress?.status ?? "not_started") as MissionStatus,
        lastActivityAt: progress?.last_activity_at ?? null,
      };
    })
    .filter((x): x is MissionCollectionItem => x !== null);

  /*
   * In progress first, then not started, then complete.
   *
   * Architecture §4 asks My Missions to answer "where do I continue?" — a
   * mission already underway is the likeliest answer, so it is not left to be
   * found among the others. Within a group, most recent activity first.
   *
   * This is ordering, not search or filtering, both of which Architecture §22
   * defers until mission volume creates the need.
   */
  const RANK: Record<MissionStatus, number> = {
    in_progress: 0,
    not_started: 1,
    complete: 2,
  };

  return collection.sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
  );
}

/**
 * Every child's collection and access-code status for the Account page, in
 * three reads for the whole family rather than several per child (found in
 * Final QA: LOW-1). The child ids come from `listChildren`, which is scoped
 * to the authenticated parent inside its query — never from the browser —
 * and RLS applies to every read here as well.
 */
export async function getFamilyMissionCollections(): Promise<
  { id: string; name: string; missions: MissionCollectionItem[]; codeActive: boolean }[]
> {
  const { supabase } = await requireParent();
  const children = await listChildren();
  if (!children.length) return [];
  const ids = children.map((c) => c.id);

  const [ent, prog, cred] = await Promise.all([
    supabase.from("mission_entitlements").select("child_id, mission_id, missions(*)").in("child_id", ids).eq("status", "active"),
    supabase.from("mission_progress").select("child_id, mission_id, status, last_activity_at").in("child_id", ids),
    supabase.from("child_access_credentials").select("child_id").in("child_id", ids).is("revoked_at", null),
  ]);
  if (ent.error || prog.error || cred.error) throw new Error("family_collections_unavailable");

  const withCode = new Set((cred.data ?? []).map((c) => c.child_id));
  return children.map((c) => ({
    id: c.id,
    name: c.display_name,
    missions: buildCollection(
      (ent.data ?? []).filter((e) => e.child_id === c.id),
      (prog.data ?? []).filter((p) => p.child_id === c.id),
    ),
    codeActive: withCode.has(c.id),
  }));
}

export type MissionHomeData = {
  mission: MissionRow;
  progress: MissionProgressRow | null;
  status: MissionStatus;
  resources: MissionResourceRow[];
  parentNote: string | null;
  /** Whether For Parents will serve a document rather than the text note. */
  hasParentNoteDocument: boolean;
};

/**
 * Everything Mission Home needs (Architecture §5).
 *
 * Resources and the parent note are loaded regardless of status — Architecture
 * §7 and §8 require both to remain available before, during and after
 * completion.
 */
export async function getMissionHome(
  childId: string,
  missionIdOrSlug: string,
): Promise<MissionHomeData> {
  const { mission, progress, supabase } = await requireEntitledMission(
    childId,
    missionIdOrSlug,
  );

  /*
   * D-63 — both are version-scoped now, so both resolve through the version
   * this child's run is pinned to. Selecting on mission_id alone would return
   * one row per version.
   */
  const { data: version } = await supabase.rpc("effective_mission_version", {
    p_child_id: childId,
    p_mission_id: mission.id,
  });
  const effective = version ?? mission.version;

  const [{ data: resources }, { data: note }] = await Promise.all([
    supabase
      .from("mission_resources")
      .select("*")
      .eq("mission_id", mission.id)
      .eq("version", effective)
      .order("sort_order", { ascending: true }),
    supabase
      .from("mission_parent_notes")
      .select("content, document_path")
      .eq("mission_id", mission.id)
      .eq("version", effective)
      .maybeSingle(),
  ]);

  return {
    mission,
    progress,
    status: progress?.status ?? "not_started",
    resources: resources ?? [],
    parentNote: note?.content ?? null,
    hasParentNoteDocument: Boolean(note?.document_path),
  };
}
