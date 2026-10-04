"use server";

import { ChildSessionUnavailableError } from "@/lib/child-session";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { resolveAcademyActor } from "@/features/academy/actor";
import { gatewayFor } from "@/features/academy/play";
import {
  startVia,
  deviceCategory,
  recordInteractionVia,
  recordClientEventVia,
  MissionPersistenceError,
  type InteractionResult,
} from "./persistence";
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
  if (actor.kind !== "parent" && actor.kind !== "child") {
    throw new Error("No active child profile.");
  }
  // One path for both actors: authorise, start, initialise the run once (D-80).
  const device = deviceCategory((await headers()).get("user-agent"));
  await startVia(gatewayFor(actor, missionSlug), { device });

  revalidatePath(`/academy/missions/${missionSlug}`);
  revalidatePath("/academy/my-missions");
  redirect(`/academy/missions/${missionSlug}/active`);
}

export type InteractionOutcome =
  | ({ ok: true } & InteractionResult)
  | { ok: false; retryable: true; message: string; /** Validation, not persistence: nothing is wrong with the save. */ notAccepted?: boolean };

/**
 * Analytics the browser reports — Mission Control opened, a Kit file opened,
 * a device fallback used. Allow-listed and sanitised in recordClientEventVia;
 * the run comes from the server's own lookup, never from the browser (D-76).
 */
export async function recordMissionEventAction(
  missionSlug: string,
  name: string,
  detail: { level?: number; source?: string } = {},
): Promise<void> {
  const actor = await resolveAcademyActor();
  if (actor.kind !== "parent" && actor.kind !== "child") return;
  try {
    await recordClientEventVia(gatewayFor(actor, missionSlug), name, detail);
  } catch {
    // Reporting must never break a mission.
  }
}

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
  let actor;
  try {
    actor = await resolveAcademyActor();
  } catch (error) {
    // The session service was unreachable (D-98): the child stays exactly
    // where they are and can try again — they have not been signed out.
    if (error instanceof ChildSessionUnavailableError) {
      return { ok: false, retryable: true, message: "We couldn't reach the Academy just now." };
    }
    throw error;
  }
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
  if (result.failure) {
    // Validation failed: nothing moved. The child keeps their input and sees why.
    return { ok: false, retryable: true, notAccepted: true, message: result.failure.message };
  }

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
