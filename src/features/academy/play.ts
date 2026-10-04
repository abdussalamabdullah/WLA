import "server-only";

import { createChildClient, type ChildSession } from "@/lib/child-session";
import {
  parentGateway,
  loadStageVia,
  deviceCategory,
  recordKitOpenedVia,
  type MissionGateway,
  type MissionStage,
} from "@/features/mission-engine/persistence";
import { loadRun, recordRunEvents, saveRun } from "@/features/mission-engine/store";
import type { AcademyActor } from "./actor";
import type {
  MissionEvidenceRow,
  WlaLab,
  MissionProgressRow,
  MissionRow,
} from "@/types/database";
import type { EvidenceWithUrl } from "@/features/mission-trail/queries";

/**
 * PLAYING A MISSION AS A CHILD — D-59.
 *
 * The child half of `MissionGateway`. It performs the same four database
 * operations as the parent half, and carries none of the mission logic: the
 * reducer, the canonical tracker, the screen-match check and completion
 * evaluation all live in `recordInteractionVia` and are shared.
 *
 * Every call passes the session token and NO child id. The database derives
 * the child, re-scopes the progress id to it, and refuses anything else.
 */
/**
 * The child-session gateway (D-59). Authorisation is the token: the run is
 * identified by `child_session_mission`, which derives the child from the
 * token inside the database and checks the entitlement. Only then does the
 * engine store load or save that run (D-80) — with the progress id that
 * lookup returned, never one from the browser.
 */
export function childGateway(session: ChildSession, missionSlug: string): MissionGateway {
  const supabase = createChildClient();

  return {
    childId: session.childId,

    async resolve() {
      const { data: missionRows } = await supabase.rpc("child_session_mission", {
        p_token: session.token,
        p_mission_slug: missionSlug,
      });
      const m = missionRows?.[0];
      if (!m) throw new Error("not_entitled");

      const mission = {
        id: m.mission_id,
        slug: m.slug,
        title: m.title,
        description: m.description,
        lab: m.lab,
        min_age: m.min_age,
        max_age: m.max_age,
        duration: m.duration,
        delivery_type: m.delivery_type,
        cover_image: m.cover_image,
        price_minor: null,
        currency: "GBP",
        is_free: false,
        version: m.mission_version ?? 1,
        published: true,
        completion_rule: null,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      } as MissionRow;

      const progress = m.progress_id
        ? ({
            id: m.progress_id,
            child_id: session.childId,
            mission_id: m.mission_id,
            status: m.status,
            current_screen_key: m.current_screen_key,
            mission_version: m.mission_version ?? 1,
            completion_rule: m.completion_rule,
            started_at: null,
            completed_at: null,
            last_activity_at: new Date().toISOString(),
            created_at: new Date(0).toISOString(),
            updated_at: new Date(0).toISOString(),
          } as unknown as MissionProgressRow)
        : null;

      return {
        mission,
        progress,
        childAgeYears: session.birthYear ? new Date().getFullYear() - session.birthYear : null,
      };
    },

    async start(missionId) {
      const { error } = await supabase.rpc("child_session_start_mission", {
        p_token: session.token,
        p_mission_id: missionId,
      });
      if (error) throw new Error(`Could not start mission: ${error.message}`);
    },

    load: loadRun,
    save: saveRun,
    events: recordRunEvents,
  };
}

export function gatewayFor(actor: AcademyActor, missionSlug: string): MissionGateway {
  if (actor.kind === "child") return childGateway(actor.session, missionSlug);
  if (actor.kind === "parent") return parentGateway(actor.childId, missionSlug);
  throw new Error("No learner context.");
}

/** The stage, for whoever is looking. */
export async function getStageFor(
  actor: AcademyActor,
  missionSlug: string,
): Promise<MissionStage> {
  const { headers } = await import("next/headers");
  const device = deviceCategory((await headers()).get("user-agent"));
  if (actor.kind === "parent") return loadStageVia(parentGateway(actor.childId, missionSlug), { device });
  if (actor.kind === "child") return loadStageVia(childGateway(actor.session, missionSlug), { device });
  throw new Error("No learner context.");
}

/**
 * The child's Mission Trail.
 *
 * Trail entries for Six Names are PHYSICAL — a Case Board, a tracker, a
 * judgement card — so there is no file to sign. `withSignedUrls` on the parent
 * path exists for digital evidence; the child RPC returns the same records
 * without storage paths, and physical evidence is recorded, never faked as
 * stored (Architecture §10).
 */
export async function getTrailFor(
  actor: AcademyActor,
  missionSlug: string,
): Promise<{ missionTitle: string; lab: WlaLab; evidence: EvidenceWithUrl[] } | null> {
  if (actor.kind === "parent") {
    const { getMissionTrail } = await import("@/features/mission-trail/queries");
    return getMissionTrail(actor.childId, missionSlug);
  }
  if (actor.kind !== "child") return null;

  const supabase = createChildClient();
  const [{ data: missionRows }, { data: rows }] = await Promise.all([
    supabase.rpc("child_session_mission", {
      p_token: actor.session.token,
      p_mission_slug: missionSlug,
    }),
    supabase.rpc("child_session_trail", {
      p_token: actor.session.token,
      p_mission_slug: missionSlug,
    }),
  ]);
  const m = missionRows?.[0];
  if (!m) return null;

  return {
    missionTitle: m.title,
    lab: m.lab,
    evidence: (rows ?? []).map((e) => ({
      evidence: {
        id: e.id,
        child_id: actor.session.childId,
        mission_id: m.mission_id,
        progress_id: m.progress_id,
        type: e.type,
        title: e.title,
        description: e.description,
        // The child RPC deliberately does not return storage_path: a URL is
        // minted only for stored files, and Six Names' Trail entries are
        // physical. The Academy must never imply it holds an artefact it does
        // not (Architecture §15).
        storage_path: null,
        created_at: e.created_at,
        evidence_key: e.evidence_key,
        related_to: e.related_to,
        relation: e.relation,
        source: e.source,
        screen_key: e.screen_key,
      } as unknown as MissionEvidenceRow,
      url: null,
    })),
  };
}

/**
 * The Mission Kit, for either actor — D-63, D-64.
 *
 * The two actors differ only in how a file becomes openable:
 *   parent → a signed URL minted with the parent's own session
 *   child  → a link to /api/kit/<id>, which authorises in the database and
 *            signs server-side
 *
 * The child path never receives a signed URL in the page. A URL embedded in
 * HTML outlives the render and can be forwarded; a link to the handler is
 * re-authorised on every click.
 */
export async function getKitFor(
  actor: AcademyActor,
  missionSlug: string,
): Promise<
  | {
      missionTitle: string;
      items: {
        id: string;
        title: string;
        description: string | null;
        type: string;
        canView: boolean;
        canPrint: boolean;
        canDownload: boolean;
        href: string | null;
      }[];
    }
  | null
> {
  if (actor.kind === "parent") {
    /*
     * ONE pass of the permissions chain, not two. Fetching the Kit and the
     * mission separately doubled the `auth.getUser()` calls on this page and
     * tipped GoTrue into rejecting them, which the client answered with
     * retry backoff — 25–44s to open the Mission Kit.
     */
    const { getMissionKitWithTitle } = await import("@/features/missions/resources");
    const kit = await getMissionKitWithTitle(actor.childId, missionSlug);
    return {
      missionTitle: kit.missionTitle,
      items: kit.items.map(({ resource, url }) => ({
        id: resource.id,
        title: resource.title,
        description: resource.description,
        type: resource.type,
        canView: resource.can_view,
        canPrint: resource.can_print,
        canDownload: resource.can_download,
        href: url,
      })),
    };
  }

  if (actor.kind !== "child") return null;

  const supabase = createChildClient();
  const [{ data: missionRows }, { data: rows }] = await Promise.all([
    supabase.rpc("child_session_mission", {
      p_token: actor.session.token,
      p_mission_slug: missionSlug,
    }),
    supabase.rpc("child_session_kit", {
      p_token: actor.session.token,
      p_mission_slug: missionSlug,
    }),
  ]);
  const m = missionRows?.[0];
  if (!m) return null;

  return {
    missionTitle: m.title,
    items: (rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      type: r.type,
      canView: r.can_view,
      canPrint: r.can_print,
      canDownload: r.can_download,
      href: r.can_view ? `/api/kit/${r.id}` : null,
    })),
  };
}

/** Mission Kit opened by a learner whose run is in progress (§13 analytics). */
export async function recordKitOpenedFor(actor: AcademyActor, missionSlug: string, source: "page" | "file") {
  if (actor.kind !== "parent" && actor.kind !== "child") return;
  await recordKitOpenedVia(gatewayFor(actor, missionSlug), source);
}
