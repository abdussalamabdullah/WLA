import "server-only";

import { requireEntitledMission } from "@/lib/permissions";
import { logError } from "@/lib/observability/logger";
import { EngineRefusal, startRun, step } from "./runtime";
import { projectCurrent, type ProjectedScreen } from "./projection";
import {
  loadRun as storeLoad,
  recordRunEvents,
  saveRun as storeSave,
  signMedia,
  type LoadedRun,
} from "./store";
import { assetKeysIn, resolveMedia } from "./media";
import {
  emptyMissionState,
  missionInteraction,
  type MissionInteraction,
  type MissionStateData,
} from "./schemas";
import type { AnalyticsDraft } from "./contract";
import type { MissionProgressRow, MissionRow } from "@/types/database";

/**
 * MISSION PERSISTENCE — the server half of every learner interaction.
 *
 * Tech Spec §29: "Supabase should hold the authoritative state." Since D-80 it
 * genuinely does: no browser can write a run. The flow for both actors is
 *
 *   gateway.resolve()  → AUTHORISE and identify the run (actor-specific)
 *   gateway.load()     → the whole pinned model + full state (service-role store)
 *   runtime.step()     → the one shared transition (pure)
 *   gateway.save()     → engine_save, atomically: state, private state,
 *                        response, Trail evidence, analytics, completion
 *   projectCurrent()   → the only thing the browser receives
 *
 * GENERIC BY CONSTRUCTION. Nothing here may branch on a mission's identity.
 */

export type RunContext = {
  mission: MissionRow;
  progress: MissionProgressRow | null;
  childAgeYears: number | null;
};

export type MissionGateway = {
  /** The verified child. An authorisation INPUT, never a result. */
  childId: string;
  /** Authorise the actor for this mission and return the run, if any. */
  resolve(): Promise<RunContext>;
  /** Create the run at its first screen (the actor's start RPC). Idempotent. */
  start(missionId: string): Promise<void>;
  load(progressId: string): Promise<LoadedRun>;
  save: typeof storeSave;
  events: typeof recordRunEvents;
};

export type MissionStage = {
  mission: MissionRow;
  progress: MissionProgressRow | null;
  /** Client-safe state (projection.ts). */
  state: MissionStateData;
  /** The projected current screen, or null when not started. */
  screen: ProjectedScreen | null;
};

/** D-18 — persistence failed, so the mission has NOT advanced. */
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
  /** A validation failure: nothing moved; the child sees this message. */
  failure?: { code: string; message: string };
};

/**
 * Coarse device category from the user agent — phone, tablet or desktop and
 * nothing finer (D-76: structural, never identifying).
 */
export function deviceCategory(userAgent: string | null | undefined): "phone" | "tablet" | "desktop" {
  const ua = userAgent ?? "";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return "phone";
  return "desktop";
}

/** A gap after which returning counts as a new session (multi-session analytics). */
const SESSION_GAP_MS = 30 * 60 * 1000;

function gapBucket(ms: number): string {
  if (ms < 24 * 3600e3) return "under_1d";
  if (ms < 7 * 24 * 3600e3) return "1d_7d";
  return "over_7d";
}

// ------------------------------------------------------------ parent actor --

export function parentGateway(childId: string, missionIdOrSlug: string): MissionGateway {
  return {
    childId,
    async resolve() {
      const { child, mission, progress } = await requireEntitledMission(childId, missionIdOrSlug);
      const birthYear = (child as { birth_year?: number | null }).birth_year ?? null;
      return {
        mission,
        progress,
        childAgeYears: birthYear ? new Date().getFullYear() - birthYear : null,
      };
    },
    async start(missionId) {
      const { supabase, child } = await requireEntitledMission(childId, missionIdOrSlug);
      const { error } = await supabase.rpc("start_mission", {
        p_child_id: child.id,
        p_mission_id: missionId,
      });
      if (error) throw new Error(`Could not start mission: ${error.message}`);
    },
    load: storeLoad,
    save: storeSave,
    events: recordRunEvents,
  };
}

// --------------------------------------------------------------- shared ----

/** The read half of pause/resume: the exact position, rebuilt from the server. */
export async function loadStageVia(gw: MissionGateway, opts: { device?: string } = {}): Promise<MissionStage> {
  const ctx = await gw.resolve();
  if (!ctx.progress || ctx.progress.status === "not_started") {
    return { mission: ctx.mission, progress: ctx.progress, state: emptyMissionState, screen: null };
  }
  const run = await gw.load(ctx.progress.id);
  const now = new Date();

  // A return after a real gap is a new session (multi-session analytics, §13).
  const last = Date.parse(run.progress.last_activity_at);
  if (run.progress.status === "in_progress" && !Number.isNaN(last) && now.getTime() - last > SESSION_GAP_MS) {
    await gw.events(run.progress.id, [
      {
        name: "session_resumed",
        screen_key: run.progress.current_screen_key,
        detail: { gap: gapBucket(now.getTime() - last), ...(opts.device ? { device: opts.device } : {}) },
      },
    ]);
  }

  const projected = projectCurrent(run.model, run.progress.current_screen_key, run.state, now);
  let screen = projected.screen;
  if (screen) {
    // F7: media for this screen only, at the pinned version.
    const keys = assetKeysIn(screen.configuration);
    if (keys.length) screen = resolveMedia(screen, await signMedia(run.progress.mission_id, run.progress.mission_version, keys));
  }
  return { mission: ctx.mission, progress: run.progress, state: projected.state, screen };
}

/**
 * Start — or resume — a mission. Safe to repeat: the start RPC is idempotent,
 * and run initialisation (variables, variant, pool draws) happens exactly once,
 * from a server-generated seed.
 */
export async function startVia(gw: MissionGateway, opts: { device?: string } = {}): Promise<MissionProgressRow> {
  const before = await gw.resolve();
  const wasStarted = before.progress !== null && before.progress.status !== "not_started";
  if (!wasStarted) await gw.start(before.mission.id);

  const ctx = wasStarted ? before : await gw.resolve();
  if (!ctx.progress) throw new Error("Could not start mission: no record");
  const run = await gw.load(ctx.progress.id);

  if (run.state.seed === null && run.progress.status !== "complete") {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
    const init = startRun(run.model, run.state, run.progress.current_screen_key, new Date(), seed, ctx.childAgeYears);
    const started: AnalyticsDraft = { name: "mission_started", detail: opts.device ? { device: opts.device } : {} };
    const events: AnalyticsDraft[] = wasStarted ? init.events : [started, ...init.events];
    const saved = await gw.save({
      progressId: run.progress.id,
      model: run.model,
      state: init.state,
      screenKey: null,
      response: null,
      complete: false,
      evidence: [],
      events,
    });
    if (!saved) throw new MissionPersistenceError();
    return saved;
  }
  return run.progress;
}

/**
 * Record one interaction and advance. Completion, Trail saves, unlocks, events
 * and analytics are decided by the runtime and written in ONE transaction by
 * engine_save — the child never sees a screen claiming Complete while the
 * backing state is unwritten.
 */
export async function recordInteractionVia(
  gw: MissionGateway,
  rawInteraction: MissionInteraction,
): Promise<InteractionResult> {
  const parsed = missionInteraction.safeParse(rawInteraction);
  if (!parsed.success) throw new Error("Unrecognised mission interaction.");
  const interaction = parsed.data;

  const ctx = await gw.resolve();
  if (!ctx.progress) throw new Error("This mission has not been started.");
  const run = await gw.load(ctx.progress.id);
  const progress = run.progress;

  // Architecture §17 — a completed run is terminal. Replay is deferred (D-78).
  if (progress.status === "complete") {
    return { state: run.state, currentScreenKey: progress.current_screen_key, status: "complete", completed: true };
  }

  const now = new Date();
  let result;
  try {
    result = step(run.model, run.state, progress.current_screen_key, interaction, now);
  } catch (error) {
    if (error instanceof EngineRefusal) {
      throw new Error("That interaction does not belong to the current step.");
    }
    throw error;
  }

  if (!result.ok) {
    // Nothing moves; the attempt and the failure are recorded.
    await gw.save({
      progressId: progress.id,
      model: run.model,
      state: result.state,
      screenKey: null,
      response: null,
      complete: false,
      evidence: [],
      events: result.events,
    });
    const projected = projectCurrent(run.model, progress.current_screen_key, result.state, now);
    return {
      state: projected.state,
      currentScreenKey: progress.current_screen_key,
      status: progress.status,
      completed: false,
      failure: result.failure,
    };
  }

  const saved = await gw.save({
    progressId: progress.id,
    model: run.model,
    state: result.state,
    screenKey: result.nextScreenKey,
    response: result.response,
    complete: result.completed,
    evidence: result.evidence,
    events: result.events,
  });
  if (!saved) {
    // OPS-01. Identifiers only — never state, responses or screen content.
    logError(result.completed ? "mission_completion_failed" : "mission_persist_failed", null, {
      missionId: ctx.mission.id,
      progressId: progress.id,
      interaction: interaction.kind,
    });
    throw new MissionPersistenceError(
      result.completed ? "We couldn't finish saving this mission. Please try again." : undefined,
    );
  }

  const projected = projectCurrent(run.model, saved.current_screen_key, result.state, now);
  return {
    state: projected.state,
    currentScreenKey: saved.current_screen_key,
    status: saved.status,
    completed: result.completed,
  };
}

/** Analytics the browser reports (Mission Control opened, a Kit file opened...). */
const CLIENT_EVENTS = new Set(["mission_control_opened", "kit_opened", "device_fallback_used"]);

/** Server-observed Mission Kit use during an active run (§13). */
export async function recordKitOpenedVia(gw: MissionGateway, source: "page" | "file"): Promise<void> {
  try {
    const ctx = await gw.resolve();
    if (ctx.progress?.status !== "in_progress") return;
    await gw.events(ctx.progress.id, [{ name: "kit_opened", screen_key: ctx.progress.current_screen_key, detail: { source } }]);
  } catch {
    // Reporting must never break the Kit.
  }
}

export async function recordClientEventVia(
  gw: MissionGateway,
  name: string,
  detail: { level?: number; source?: string } = {},
): Promise<void> {
  if (!CLIENT_EVENTS.has(name)) return;
  const ctx = await gw.resolve();
  if (!ctx.progress || ctx.progress.status === "not_started") return;
  const safe: Record<string, string | number> = {};
  if (typeof detail.level === "number" && detail.level >= 1 && detail.level <= 3) safe.level = Math.floor(detail.level);
  if (typeof detail.source === "string" && /^[a-z_]{1,32}$/.test(detail.source)) safe.source = detail.source;
  await gw.events(ctx.progress.id, [{ name, screen_key: ctx.progress.current_screen_key, detail: safe }]);
}

// ------------------------------------------------ parent-path conveniences --

export function getMissionStage(childId: string, missionIdOrSlug: string): Promise<MissionStage> {
  return loadStageVia(parentGateway(childId, missionIdOrSlug));
}

export function startMission(childId: string, missionIdOrSlug: string): Promise<MissionProgressRow> {
  return startVia(parentGateway(childId, missionIdOrSlug));
}

export function recordInteraction(
  childId: string,
  missionIdOrSlug: string,
  interaction: MissionInteraction,
): Promise<InteractionResult> {
  return recordInteractionVia(parentGateway(childId, missionIdOrSlug), interaction);
}
