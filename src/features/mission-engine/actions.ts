"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { resolveAcademyActor } from "@/features/academy/actor";
import { gatewayFor } from "@/features/academy/play";
import {
  startMission,
  recordInteractionVia,
  MissionPersistenceError,
  type InteractionResult,
} from "./persistence";
import { createChildClient } from "@/lib/child-session";
import type { MissionInteraction } from "./schemas";

/**
 * Mission mutations.
 *
 * Start is a server action behind a form, never a link: a GET navigation must
 * not create or mutate progress. That also makes it safe against prefetch,
 * which would otherwise start missions the child only hovered over.
 */

/**
 * Start — for either actor (D-59).
 *
 * The parent path calls `startMission`, which runs the permissions chain. The
 * child path calls `child_session_start_mission`, which derives the child from
 * the token and then calls the SAME `start_mission` database function, so D-17
 * pinning and idempotency are identical for both.
 */
export async function startMissionAction(missionSlug: string) {
  const actor = await resolveAcademyActor();

  if (actor.kind === "child") {
    const supabase = createChildClient();
    // The mission id is resolved from the slug by the database, scoped to the
    // child's own entitlements — it is never taken from the browser.
    const { data: rows } = await supabase.rpc("child_session_mission", {
      p_token: actor.session.token,
      p_mission_slug: missionSlug,
    });
    const mission = rows?.[0];
    if (!mission) throw new Error("No access to this mission.");

    await supabase.rpc("child_session_start_mission", {
      p_token: actor.session.token,
      p_mission_id: mission.mission_id,
    });
    await supabase.rpc("child_session_record_event", {
      p_token: actor.session.token,
      p_mission_id: mission.mission_id,
      p_name: "mission_started",
    });
  } else if (actor.kind === "parent") {
    // Idempotent: a double submit resumes rather than restarting.
    await startMission(actor.childId, missionSlug);
  } else {
    throw new Error("No active child profile.");
  }

  revalidatePath(`/academy/missions/${missionSlug}`);
  revalidatePath("/academy/my-missions");
  redirect(`/academy/missions/${missionSlug}/active`);
}

/**
 * D-18 — the shape the UI works with.
 *
 * Interaction → persist → success → advance. A failure is a value, not an
 * exception, so the screen can keep the learner exactly where they are and
 * offer a retry instead of showing an error boundary.
 */
export type InteractionOutcome =
  | ({ ok: true } & InteractionResult)
  | { ok: false; retryable: true; message: string };

/**
 * Record one meaningful interaction. Called by mission screen components once
 * the registry is populated; generic over every mission.
 *
 * Nothing here advances the mission before the server has confirmed the write:
 * `recordInteraction` persists first and only then returns the new position,
 * and revalidation happens strictly after that.
 */
export async function recordInteractionAction(
  missionSlug: string,
  interaction: MissionInteraction,
): Promise<InteractionOutcome> {
  const actor = await resolveAcademyActor();
  if (actor.kind !== "parent" && actor.kind !== "child") {
    throw new Error("No active child profile.");
  }

  let result: InteractionResult;
  try {
    // One shared implementation for both actors; only the gateway differs.
    result = await recordInteractionVia(
      gatewayFor(actor, missionSlug),
      interaction,
    );
  } catch (error) {
    if (error instanceof MissionPersistenceError) {
      // The learner stays where they are. No revalidation, no redirect —
      // nothing that would imply a transition the server did not record.
      return { ok: false, retryable: true, message: error.message };
    }
    throw error;
  }

  // Only reached once the write succeeded.
  revalidatePath(`/academy/missions/${missionSlug}/active`);

  if (result.completed) {
    revalidatePath(`/academy/missions/${missionSlug}`);
    revalidatePath("/academy/my-missions");
    // redirect() throws by design — kept outside the try so it is never
    // mistaken for a persistence failure.
    redirect(`/academy/missions/${missionSlug}/complete`);
  }

  return { ok: true, ...result };
}
