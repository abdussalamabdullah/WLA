import "server-only";

import { requireEntitledMission } from "@/lib/permissions";
import { recordEvent } from "@/lib/analytics/events";
import { logError } from "@/lib/observability/logger";
import {
  applyCanonicalTracker,
  applyInteraction,
  screenAfterInteraction,
  type MissionScreen,
} from "./navigation";
import {
  completionRule,
  isMissionComplete,
  missionInteraction,
  parseMissionState,
  type MissionInteraction,
  type MissionStateData,
} from "./index";
import type { Json, MissionProgressRow, MissionRow } from "@/types/database";

/**
 * MISSION PERSISTENCE — Sprint 6.
 *
 * Tech Spec §29: "Supabase should hold the authoritative state." Nothing here
 * writes to localStorage, and nothing reads it. A mission survives a refresh,
 * a closed tab, a different device and a different day because the server —
 * not the browser — knows where the child is.
 *
 * Authorisation: every entry point begins with `requireEntitledMission`, which
 * runs validation steps 1–3. The database functions re-check ownership and
 * entitlement independently (step 4), so a direct RPC call is equally safe.
 *
 * GENERIC BY CONSTRUCTION. Nothing in this file may branch on a mission's
 * identity. Mission-specific behaviour arrives as `mission_screens`
 * configuration and `custom` state, both defined by a Mission Build Brief.
 */

/**
 * What the Active Mission screen is allowed to know.
 *
 * Exactly ONE screen — the child's current position — plus the key of the
 * next screen by sequence, which navigation needs and which reveals a name,
 * never content.
 *
 * Future screens are not filtered out client-side; they are never fetched.
 * mission_screens has no client read policy at all (the screen_access
 * migration), so this
 * is the only path to screen content and the stage check lives in the
 * database, not in the interface.
 */
export type MissionStage = {
  mission: MissionRow;
  progress: MissionProgressRow | null;
  state: MissionStateData;
  /** Null when not started, or when the mission has no screens yet. */
  screen: MissionScreen | null;
  /** The next screen by sequence. A key only. */
  nextSequenceKey: string | null;
};

/**
 * Load the child's current stage.
 *
 * This is the read half of pause/resume: it reconstructs the exact position
 * from the server, which is what makes refresh recovery and leave-and-return
 * recovery the same code path rather than two features.
 */
export async function getMissionStage(
  childId: string,
  missionIdOrSlug: string,
): Promise<MissionStage> {
  const { child, mission, progress, supabase } = await requireEntitledMission(
    childId,
    missionIdOrSlug,
  );

  const [stateResult, screenResult] = await Promise.all([
    progress
      ? supabase
          .from("mission_state")
          .select("state_data")
          .eq("progress_id", progress.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    progress
      ? supabase.rpc("get_current_mission_screen", {
          p_child_id: child.id,
          p_mission_id: mission.id,
        })
      : Promise.resolve({ data: null }),
  ]);

  const row = Array.isArray(screenResult.data) ? screenResult.data[0] : null;

  return {
    mission,
    progress,
    state: parseMissionState(stateResult.data?.state_data),
    screen: row
      ? {
          screenKey: row.screen_key,
          type: row.type,
          title: row.title,
          body: row.body,
          sequence: row.sequence,
          configuration: row.configuration,
        }
      : null,
    nextSequenceKey: row?.next_sequence_key ?? null,
  };
}

/**
 * Start — or resume — a mission.
 *
 * Tech Spec §27. Safe to call repeatedly: the RPC is idempotent, so a
 * double-click, a retried request or a re-submitted form cannot create a
 * second progress record or reset a child's position.
 */
export async function startMission(
  childId: string,
  missionIdOrSlug: string,
): Promise<MissionProgressRow> {
  const { child, mission, progress, supabase } = await requireEntitledMission(
    childId,
    missionIdOrSlug,
  );

  const wasAlreadyStarted =
    progress !== null && progress.status !== "not_started";

  const { data, error } = await supabase.rpc("start_mission", {
    p_child_id: child.id,
    p_mission_id: mission.id,
  });

  if (error || !data) {
    throw new Error(
      `Could not start mission: ${error?.message ?? "no record"}`,
    );
  }

  // Tech Spec §42 — fired only on a genuine first start, so resuming does not
  // inflate the metric.
  if (!wasAlreadyStarted) {
    await recordEvent({
      name: "mission_started",
      childId: child.id,
      missionId: mission.id,
      progressId: data.id,
    });
  }

  return data;
}

/**
 * D-18 — persistence failed, so the mission has NOT advanced.
 *
 * Thrown only after the reducer has run and before anything is returned to the
 * caller, so a caller that catches this still holds the pre-interaction state.
 * There is no retry queue and no offline persistence: the learner simply
 * retries the same interaction.
 */
export class MissionPersistenceError extends Error {
  readonly retryable = true;
  constructor(message = "Your progress couldn't be saved.") {
    super(message);
    this.name = "MissionPersistenceError";
  }
}

export type InteractionResult = {
  state: MissionStateData;
  currentScreenKey: string | null;
  status: MissionProgressRow["status"];
  completed: boolean;
};

/**
 * Record one meaningful interaction and advance.
 *
 * Tech Spec §29 defines the save points: choice confirmed, response submitted,
 * reveal unlocked, branch established, handoff confirmed, screen transition.
 * Each arrives here as a `MissionInteraction`.
 *
 * After every interaction the mission's configured completion rule is
 * evaluated. If it is satisfied, completion happens in the same request
 * through the atomic RPC — the child never sees a screen claiming Complete
 * while the backing state is unwritten.
 */
/**
 * HOW THIS FUNCTION TALKS TO THE DATABASE — D-59.
 *
 * Two actors can now play a mission: a parent with a child selected, and a
 * child with their own session. They differ ONLY in which database calls
 * carry the authorisation — the parent path runs the permissions chain and
 * RLS, the child path passes a session token to `security definer` functions
 * that derive the child inside the database.
 *
 * Everything else — the reducer, the canonical tracker, the screen-match
 * check, completion evaluation, D-17's pinned rule — is identical, and a
 * second copy of it for children would be the one thing most likely to rot.
 * So the three database touchpoints are injected and the logic is shared.
 */
export type MissionGateway = {
  /** The verified child. An authorisation INPUT, never a result. */
  childId: string;
  loadStage(): Promise<MissionStage>;
  persist(args: {
    progressId: string;
    state: MissionStateData;
    screenKey: string | null;
    responseKey: string | null;
    responseValue: Json | null;
  }): Promise<MissionProgressRow | null>;
  complete(args: {
    progressId: string;
    state: MissionStateData;
  }): Promise<MissionProgressRow | null>;
  /** Analytics must never become a reason a mission fails (D-50). */
  recordEvent(name: "mission_started" | "mission_completed", missionId: string, progressId: string): Promise<void>;
};

export async function recordInteraction(
  childId: string,
  missionIdOrSlug: string,
  rawInteraction: MissionInteraction,
): Promise<InteractionResult> {
  return recordInteractionVia(
    parentGateway(childId, missionIdOrSlug),
    rawInteraction,
  );
}

/** The parent path: the permissions chain plus RLS, exactly as before. */
export function parentGateway(
  childId: string,
  missionIdOrSlug: string,
): MissionGateway {
  return {
    childId,
    loadStage: () => getMissionStage(childId, missionIdOrSlug),
    async persist({ progressId, state, screenKey, responseKey, responseValue }) {
      const { supabase } = await requireEntitledMission(childId, missionIdOrSlug);
      const { data, error } = await supabase.rpc("persist_mission_state", {
        p_progress_id: progressId,
        p_state: state as unknown as Json,
        p_screen_key: screenKey,
        p_response_key: responseKey,
        p_response_value: responseValue as Json,
      });
      if (error) return null;
      return data as unknown as MissionProgressRow;
    },
    async complete({ progressId, state }) {
      const { supabase } = await requireEntitledMission(childId, missionIdOrSlug);
      const { data, error } = await supabase.rpc("complete_mission", {
        p_progress_id: progressId,
        p_state: state as unknown as Json,
        p_trail: [] as unknown as Json,
      });
      if (error) return null;
      return data as unknown as MissionProgressRow;
    },
    async recordEvent(name, missionId, progressId) {
      await recordEvent({ name, childId, missionId, progressId });
    },
  };
}

export async function recordInteractionVia(
  gateway: MissionGateway,
  rawInteraction: MissionInteraction,
): Promise<InteractionResult> {
  const parsedInteraction = missionInteraction.safeParse(rawInteraction);
  if (!parsedInteraction.success) {
    throw new Error("Unrecognised mission interaction.");
  }
  const interaction = parsedInteraction.data;

  const stage = await gateway.loadStage();
  const { mission, progress, screen, nextSequenceKey } = stage;

  if (!progress) {
    throw new Error("This mission has not been started.");
  }

  // Architecture §17 — a completed mission is terminal. Replay is deferred.
  if (progress.status === "complete") {
    return {
      state: stage.state,
      currentScreenKey: progress.current_screen_key,
      status: "complete",
      completed: true,
    };
  }

  /*
   * `custom` is not reachable from the browser.
   *
   * Every other interaction kind names a screen and is checked against the
   * one the child is actually on. `custom` names no screen, so it skipped that
   * check and could write any key into `custom` state — including the
   * canonical tracker the Build Brief requires the Academy to hold as
   * authoritative. It exists for server-authored state (see
   * `applyCanonicalTracker`); it is not something a client may send.
   */
  if (interaction.kind === "custom") {
    throw new Error("That interaction does not belong to the current step.");
  }

  /*
   * An interaction may only target the screen the child is actually on.
   *
   * Because only that screen is ever fetched, a forged interaction for a
   * future screen — skipping ahead to Evidence, or pre-answering a
   * consequence — has nothing to match and is refused here.
   */
  if (!screen || screen.screenKey !== interaction.screenKey) {
    throw new Error("That interaction does not belong to the current step.");
  }

  /*
   * The reducer runs first, then the SERVER applies any canonical tracker
   * state the current screen declares. Order matters: the canonical patch must
   * land after the child's own interaction so nothing the browser sent can
   * overwrite it.
   */
  const nextState = applyCanonicalTracker(
    applyInteraction(stage.state, interaction),
    screen,
  );

  const nextScreenKey = screenAfterInteraction(
    interaction,
    screen,
    nextSequenceKey,
    nextState,
  );

  /*
   * Completion is decided from configuration, never from mission identity.
   *
   * D-17: the rule snapshotted onto this run wins over the mission's current
   * rule, so editing a live mission cannot change what "complete" means for a
   * child already playing.
   */
  const pinnedRule = progress.completion_rule ?? mission.completion_rule;
  const rule = pinnedRule ? completionRule.safeParse(pinnedRule) : null;

  const reachedCompletion =
    rule?.success === true && isMissionComplete(rule.data, nextState);

  if (reachedCompletion) {
    /*
     * Mission Trail entries are resolved inside complete_mission, from the
     * mission's completion screen at this run's pinned version.
     *
     * They deliberately are NOT read here. Completion is evaluated after an
     * interaction, so the current screen is whatever the child just acted on
     * — for Six Names, the `final_judgement` screen. The completion screen
     * is a configuration carrier that is never itself rendered, and the
     * engine cannot see it: mission_screens has no client read policy.
     *
     * An earlier version read `screen.configuration` when the screen happened
     * to be of type `completion`, which was never true, so every mission
     * completed with an empty Trail. Hosted validation caught it.
     *
     * `[]` means "derive them"; a non-empty array would override.
     *
     * THE COMPLETING RESPONSE IS SAVED FIRST. When the interaction that meets
     * the rule is itself a written answer (a `response_exists` rule), that
     * answer used to be dropped: complete() takes no response, so the Trail's
     * `fromResponse` entry found nothing, its description was NULL, the
     * evidence insert failed and the whole completion rolled back — the child
     * saw "That didn't save." on the last step for ever. Found building a QA
     * mission in the admin UI; Six Names never hit it because it completes on
     * a content screen. If the save lands and completion then fails, nothing
     * is lost: the answer is kept and the next attempt completes.
     */
    if (interaction.kind === "response") {
      const saved = await gateway.persist({
        progressId: progress.id,
        state: nextState,
        screenKey: nextScreenKey ?? screen.screenKey,
        responseKey: interaction.screenKey,
        responseValue: (interaction.value ?? null) as Json,
      });
      if (!saved) {
        logError("mission_persist_failed", null, {
          missionId: mission.id,
          progressId: progress.id,
          interaction: interaction.kind,
        });
        throw new MissionPersistenceError();
      }
    }

    const data = await gateway.complete({
      progressId: progress.id,
      state: nextState,
    });
    if (!data) {
      // OPS-01. Identifiers only — never state, responses or screen content.
      logError("mission_completion_failed", null, {
        missionId: mission.id,
        progressId: progress.id,
      });
      throw new MissionPersistenceError(
        "We couldn't finish saving this mission. Please try again.",
      );
    }

    await gateway.recordEvent("mission_completed", mission.id, progress.id);

    return {
      state: nextState,
      currentScreenKey: data.current_screen_key,
      status: data.status,
      completed: true,
    };
  }

  const data = await gateway.persist({
    progressId: progress.id,
    state: nextState,
    screenKey: nextScreenKey,
    responseKey: interaction.kind === "response" ? interaction.screenKey : null,
    responseValue:
      interaction.kind === "response"
        ? ((interaction.value ?? null) as Json)
        : null,
  });

  if (!data) {
    // D-18: do not advance. persist_mission_state is one transaction, so the
    // state, the response and the position are all unchanged.
    logError("mission_persist_failed", null, {
      missionId: mission.id,
      progressId: progress.id,
      interaction: interaction.kind,
    });
    throw new MissionPersistenceError();
  }

  return {
    state: nextState,
    currentScreenKey: data.current_screen_key,
    status: data.status,
    completed: false,
  };
}
