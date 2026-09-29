import "server-only";

import { requireEntitledMission } from "@/lib/permissions";
import { recordEvent } from "@/lib/analytics/events";
import { logError } from "@/lib/observability/logger";
import {
  applyInteraction,
  resolveNextScreen,
  type MissionScreen,
} from "./navigation";
import { screenConfigByType } from "./schemas";
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
 * Apply the canonical tracker state a screen declares — server-side.
 *
 * The Build Brief requires the Academy to persist the tracker state belonging
 * to the branch the child is on, and to set Clarity to "Purpose clear" when
 * Evidence is opened. That state is a property of the authored mission, so it
 * is read from the screen's own configuration, which only ever arrives through
 * the gated RPC. The browser is never asked for it and cannot influence it.
 *
 * Merged, not replaced: Evidence patches Clarity alone and must leave Spread
 * and Support exactly as the branch left them.
 *
 * Generic by construction — this knows that a screen MAY declare canonical
 * tracker state, never which mission is playing.
 */
function applyCanonicalTracker(
  state: MissionStateData,
  screen: MissionScreen,
): MissionStateData {
  const schema = screenConfigByType[screen.type];
  if (!schema) return state;

  const parsed = schema.safeParse(screen.configuration);
  if (!parsed.success) return state;

  const patch = (parsed.data as { canonicalTracker?: Record<string, string> })
    .canonicalTracker;
  if (!patch || Object.keys(patch).length === 0) return state;

  const existing =
    (state.custom.tracker as Record<string, string> | undefined) ?? {};

  return {
    ...state,
    custom: { ...state.custom, tracker: { ...existing, ...patch } },
  };
}

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
export async function recordInteraction(
  childId: string,
  missionIdOrSlug: string,
  rawInteraction: MissionInteraction,
): Promise<InteractionResult> {
  const parsedInteraction = missionInteraction.safeParse(rawInteraction);
  if (!parsedInteraction.success) {
    throw new Error("Unrecognised mission interaction.");
  }
  const interaction = parsedInteraction.data;

  const stage = await getMissionStage(childId, missionIdOrSlug);
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

  const nextScreenKey = resolveNextScreen(screen, nextSequenceKey, nextState);

  const { supabase } = await requireEntitledMission(childId, missionIdOrSlug);

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
     */
    const { data, error } = await supabase.rpc("complete_mission", {
      p_progress_id: progress.id,
      p_state: nextState as unknown as Json,
      p_trail: [] as unknown as Json,
    });
    if (error || !data) {
      // OPS-01. Identifiers only — never state, responses or screen content.
      logError("mission_completion_failed", error, {
        missionId: mission.id,
        progressId: progress.id,
      });
      throw new MissionPersistenceError(
        "We couldn't finish saving this mission. Please try again.",
      );
    }

    await recordEvent({
      name: "mission_completed",
      childId,
      missionId: mission.id,
      progressId: progress.id,
    });

    return {
      state: nextState,
      currentScreenKey: data.current_screen_key,
      status: data.status,
      completed: true,
    };
  }

  const { data, error } = await supabase.rpc("persist_mission_state", {
    p_progress_id: progress.id,
    p_state: nextState as unknown as Json,
    p_screen_key: nextScreenKey,
    p_response_key:
      interaction.kind === "response" ? interaction.screenKey : null,
    p_response_value:
      interaction.kind === "response"
        ? ((interaction.value ?? null) as Json)
        : null,
  });

  if (error || !data) {
    // D-18: do not advance. persist_mission_state is one transaction, so the
    // state, the response and the position are all unchanged.
    logError("mission_persist_failed", error, {
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
