import "server-only";

import { getMissionCollection } from "@/features/missions/queries";
import { createChildClient } from "@/lib/child-session";
import type { MissionRow, MissionStatus } from "@/types/database";
import type { AcademyActor } from "./actor";
import type { MissionCollectionItem } from "@/features/missions/queries";

/**
 * One mission collection, two actors.
 *
 * The parent path delegates to the existing query, which runs the full
 * permissions chain. The child path calls `child_session_missions`, which
 * derives the child from the session token inside the database.
 *
 * NEITHER PATH TAKES A CHILD ID FROM THE CALLER, which is what makes this
 * facade safe to put in front of both: there is no argument here that could be
 * tampered with to cross a family boundary.
 */
export async function getCollectionFor(
  actor: AcademyActor,
): Promise<MissionCollectionItem[]> {
  if (actor.kind === "parent") {
    return getMissionCollection(actor.childId);
  }

  if (actor.kind !== "child") return [];

  const supabase = createChildClient();
  const { data, error } = await supabase.rpc("child_session_missions", {
    p_token: actor.session.token,
  });
  if (error || !data) return [];

  const items: MissionCollectionItem[] = data.map((r) => ({
    mission: {
      id: r.mission_id,
      slug: r.slug,
      title: r.title,
      description: r.description,
      lab: r.lab,
      min_age: r.min_age,
      max_age: r.max_age,
      duration: r.duration,
      delivery_type: r.delivery_type,
      cover_image: r.cover_image,
      // Commercial fields are not part of a child's world and are never sent
      // to one. The shape is satisfied with inert values rather than by
      // widening the type, so a child screen cannot accidentally render price.
      price_minor: null,
      currency: "GBP",
      is_free: false,
      version: r.mission_version ?? 1,
      published: true,
      completion_rule: null,
      created_at: r.last_activity_at ?? new Date(0).toISOString(),
      updated_at: r.last_activity_at ?? new Date(0).toISOString(),
    } as MissionRow,
    status: r.status as MissionStatus,
    lastActivityAt: r.last_activity_at,
  }));

  const RANK: Record<MissionStatus, number> = {
    in_progress: 0,
    not_started: 1,
    complete: 2,
  };
  return items.sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
  );
}

/**
 * One mission's home data, for either actor.
 *
 * The parent path runs the full permissions chain. The child path goes through
 * `child_session_mission`, which derives the child from the token and joins
 * through `mission_entitlements` — so an unentitled mission returns no row and
 * the caller 404s, exactly as `requireEntitledMission` would make it.
 */
export async function getMissionHomeFor(
  actor: AcademyActor,
  slug: string,
): Promise<{
  mission: MissionRow;
  status: MissionStatus;
  hasParentNoteDocument: boolean;
} | null> {
  if (actor.kind === "parent") {
    const { getMissionHome } = await import("@/features/missions/queries");
    const home = await getMissionHome(actor.childId, slug);
    return {
      mission: home.mission,
      status: home.status,
      hasParentNoteDocument: home.hasParentNoteDocument,
    };
  }

  if (actor.kind !== "child") return null;

  const supabase = createChildClient();
  const { data, error } = await supabase.rpc("child_session_mission", {
    p_token: actor.session.token,
    p_mission_slug: slug,
  });
  if (error || !data || data.length === 0) return null;

  const r = data[0];
  return {
    mission: {
      id: r.mission_id,
      slug: r.slug,
      title: r.title,
      description: r.description,
      lab: r.lab,
      min_age: r.min_age,
      max_age: r.max_age,
      duration: r.duration,
      delivery_type: r.delivery_type,
      cover_image: r.cover_image,
      price_minor: null,
      currency: "GBP",
      is_free: false,
      version: r.mission_version ?? 1,
      published: true,
      completion_rule: null,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    } as MissionRow,
    status: r.status as MissionStatus,
    // A child is never told a parent document exists; For Parents is adult
    // guidance (Architecture §8) and is not part of the child's surface.
    hasParentNoteDocument: false,
  };
}
