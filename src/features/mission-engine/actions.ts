"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { resolveActiveChild } from "@/features/children/active-child";
import {
  startMission,
  recordInteraction,
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

async function requireActiveChildId(): Promise<string> {
  const active = await resolveActiveChild();
  if (active.status !== "ok") {
    throw new Error("No active child profile.");
  }
  return active.childId;
}

export async function startMissionAction(missionSlug: string) {
  const childId = await requireActiveChildId();

  // Idempotent: a double submit resumes rather than restarting.
  await startMission(childId, missionSlug);

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
  const childId = await requireActiveChildId();

  let result: InteractionResult;
  try {
    result = await recordInteraction(childId, missionSlug, interaction);
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
