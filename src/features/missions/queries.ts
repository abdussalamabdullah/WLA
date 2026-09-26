import "server-only";

import { requireEntitledMission, requireOwnedChild } from "@/lib/permissions";
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

  const progressByMission = new Map(
    (progressRows ?? []).map((p) => [p.mission_id, p]),
  );

  return entitlements
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
}

export type MissionHomeData = {
  mission: MissionRow;
  progress: MissionProgressRow | null;
  status: MissionStatus;
  resources: MissionResourceRow[];
  parentNote: string | null;
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

  const [{ data: resources }, { data: note }] = await Promise.all([
    supabase
      .from("mission_resources")
      .select("*")
      .eq("mission_id", mission.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("mission_parent_notes")
      .select("content")
      .eq("mission_id", mission.id)
      .maybeSingle(),
  ]);

  return {
    mission,
    progress,
    status: progress?.status ?? "not_started",
    resources: resources ?? [],
    parentNote: note?.content ?? null,
  };
}
