import { evaluate, fromLegacyCompletion, type Condition } from "./conditions";
import { contractFor, type AnalyticsDraft } from "./contract";
import {
  commonOf,
  declarations,
  nextBySequence,
  screenByKey,
  type MissionModel,
} from "./definition";
import { applyCanonicalTracker, resolveNextScreen, type MissionScreen } from "./navigation";
import type { MissionInteraction, MissionStateData } from "./schemas";
import {
  applyEffects,
  clearScreenScoped,
  initialVariables,
  type VariableDeclaration,
} from "./variables";
import type { Json } from "@/types/database";

/**
 * THE MISSION RUNTIME — one transition function for the whole Academy.
 *
 * `step` is called by the server for every learner interaction (through the
 * service-role store, D-80) and by Learner Preview in the browser for an admin.
 * Nothing about a mission's behaviour lives anywhere else: the contract decides
 * what an input means (F4), effects change variables (F1), the evaluator
 * answers every condition (F2), and routing, unlocks, reveals, events, gated
 * screens and checkpoints are resolved here (F3) from the canonical model (F8).
 *
 * Pure: no I/O, no clock and no randomness of its own — `now` and the seed come
 * from the server, which is what makes a run reproducible and time conditions
 * trustworthy.
 */

export class EngineRefusal extends Error {
  constructor(readonly code: string, message = "That doesn't belong to this step.") {
    super(message);
    this.name = "EngineRefusal";
  }
}

export type EvidenceDraft = {
  key: string;
  type: "digital" | "physical";
  title: string;
  description: string | null;
  screen_key: string;
  relation?: string | null;
  related_key?: string | null;
};

export type StepResult =
  | {
      ok: true;
      state: MissionStateData;
      nextScreenKey: string | null;
      completed: boolean;
      stayed: boolean;
      response: { key: string; value: Json } | null;
      evidence: EvidenceDraft[];
      events: AnalyticsDraft[];
    }
  | {
      ok: false;
      state: MissionStateData;
      failure: { code: string; message: string };
      events: AnalyticsDraft[];
    };

const mark = (s: MissionStateData, key: string, now: Date): MissionStateData => ({
  ...s,
  marks: { ...s.marks, [key]: now.toISOString() },
});

/** The completion condition: the definition's, else the pinned rule (D-17). */
export function completionCondition(model: MissionModel): Condition | null {
  return model.definition.completion ?? fromLegacyCompletion(model.completionRule);
}

export function isComplete(model: MissionModel, state: MissionStateData, now: Date): boolean {
  const c = completionCondition(model);
  return c ? evaluate(c, { state, now }) : false;
}

/** Seconds until a checkpoint screen opens, or 0 when it is open (or not a checkpoint). */
export function checkpointWait(model: MissionModel, screenKey: string, state: MissionStateData, now: Date): number {
  const cp = model.definition.checkpoints.find((c) => c.screenKey === screenKey);
  if (!cp?.availableAfter) return 0;
  const at = state.marks[cp.availableAfter.since];
  if (!at) return 0;
  const opens = Date.parse(at) + cp.availableAfter.seconds * 1000;
  return Math.max(0, Math.ceil((opens - now.getTime()) / 1000));
}

/** Seconds left on a timed screen, or null when it has no timer. */
export function timerRemaining(screen: MissionScreen, state: MissionStateData, now: Date): number | null {
  const t = commonOf(screen).timer;
  if (!t) return null;
  const entered = state.marks[`screen:${screen.screenKey}`];
  if (!entered) return t.seconds;
  return Math.max(0, t.seconds - Math.floor((now.getTime() - Date.parse(entered)) / 1000));
}

/** Gated screens are skipped (F3): follow `otherwise`, else the next by sequence. */
function passGates(model: MissionModel, candidate: string | null, state: MissionStateData, now: Date): string | null {
  let key = candidate;
  for (let guard = 0; key && guard <= model.screens.length; guard++) {
    const screen = screenByKey(model, key);
    if (!screen) return key; // the validator reports broken references
    const requires = commonOf(screen).requires;
    if (!requires || evaluate(requires, { state, now })) return key;
    key = commonOf(screen).otherwise ?? nextBySequence(model, key);
  }
  return key;
}

/** Where the child goes next (F3). */
export function resolveNext(
  model: MissionModel,
  screen: MissionScreen,
  state: MissionStateData,
  now: Date,
  overrides: { eventGoto?: string | null; contractRoute?: string | null } = {},
): string | null {
  if (overrides.eventGoto) return passGates(model, overrides.eventGoto, state, now);
  if (overrides.contractRoute) return passGates(model, overrides.contractRoute, state, now);
  for (const r of commonOf(screen).routes ?? []) {
    if (evaluate(r.when, { state, now })) return passGates(model, r.to, state, now);
  }
  // The pre-foundation chain, unchanged: chosen option → configured next → sequence.
  return passGates(model, resolveNextScreen(screen, nextBySequence(model, screen.screenKey), state), state, now);
}

/** Unlocks and changing-condition events, after every successful interaction. */
function settle(model: MissionModel, state0: MissionStateData, now: Date, decls: VariableDeclaration[]) {
  let state = state0;
  const events: AnalyticsDraft[] = [];
  let eventGoto: string | null = null;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const u of model.definition.unlocks) {
      if (!state.unlocked.includes(u.key) && evaluate(u.when, { state, now })) {
        state = { ...state, unlocked: [...state.unlocked, u.key] };
        events.push({ name: "unlock_gained", detail: { unlock: u.key } });
        changed = true;
      }
    }
    for (const ev of model.definition.events) {
      if (!state.firedEvents.includes(ev.key) && evaluate(ev.when, { state, now })) {
        state = applyEffects(state, ev.effects, { declarations: decls, now });
        state = mark({ ...state, firedEvents: [...state.firedEvents, ev.key] }, `event:${ev.key}`, now);
        events.push({ name: "event_fired", detail: { event: ev.key } });
        if (ev.goto && !eventGoto) eventGoto = ev.goto;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { state, events, eventGoto };
}

function resetScreenInput(state: MissionStateData, key: string): MissionStateData {
  const choices = { ...state.choices };
  delete choices[key];
  const multiChoices = { ...state.multiChoices };
  delete multiChoices[key];
  const custom = { ...state.custom };
  delete custom[key];
  const workspaces = { ...state.workspaces };
  delete workspaces[key];
  return {
    ...state,
    choices,
    multiChoices,
    custom,
    workspaces,
    respondedScreens: state.respondedScreens.filter((k) => k !== key),
  };
}

function enter(model: MissionModel, state0: MissionStateData, from: string, to: string | null, now: Date) {
  const events: AnalyticsDraft[] = [];
  if (!to || to === from) return { state: state0, events };
  let state = clearScreenScoped(state0, declarations(model));
  state = mark(state, `screen:${to}`, now);
  const target = screenByKey(model, to);
  events.push({ name: "screen_entered", screen_key: to, detail: { screen_type: target?.type ?? "unknown" } });
  const cp = model.definition.checkpoints.find((c) => c.screenKey === to);
  if (cp && !state.marks[`checkpoint:${cp.key}`]) {
    state = mark(state, `checkpoint:${cp.key}`, now);
    events.push({ name: "checkpoint_reached", screen_key: to, detail: { checkpoint: cp.key } });
  }
  return { state, events };
}

export function step(
  model: MissionModel,
  state0: MissionStateData,
  currentKey: string | null,
  interaction: MissionInteraction,
  now: Date,
): StepResult {
  // `custom` is server-authored state only; a client may never send it.
  if (interaction.kind === "custom") throw new EngineRefusal("not_current_step");
  const screen = screenByKey(model, currentKey);
  if (!screen || screen.screenKey !== interaction.screenKey) throw new EngineRefusal("not_current_step");
  const contract = contractFor(screen.type);
  if (!contract) throw new EngineRefusal("unknown_screen_type");

  const ctx = { model, now };
  const common = commonOf(screen);
  const decls = declarations(model);

  if (checkpointWait(model, screen.screenKey, state0, now) > 0) {
    return { ok: false, state: state0, failure: { code: "not_yet_available", message: "This part opens later." }, events: [] };
  }

  // ---- retry (D-78): this screen's input only, never the run.
  if (interaction.kind === "retry") {
    if (!common.retry?.allowed) throw new EngineRefusal("retry_not_allowed");
    return {
      ok: true,
      state: resetScreenInput(state0, screen.screenKey),
      nextScreenKey: screen.screenKey,
      completed: false,
      stayed: true,
      response: null,
      evidence: [],
      events: [{ name: "interaction_retry", screen_key: screen.screenKey }],
    };
  }

  // ---- timed stage: accepted only when the server agrees time is up.
  if (interaction.kind === "timer_expired") {
    const left = timerRemaining(screen, state0, now);
    if (left === null || left > 0) throw new EngineRefusal("timer_not_expired");
    if (common.timer?.onExpire === "stay") {
      return { ok: true, state: state0, nextScreenKey: screen.screenKey, completed: false, stayed: true, response: null, evidence: [], events: [] };
    }
  } else if (!contract.accepts.includes(interaction.kind)) {
    throw new EngineRefusal("wrong_interaction");
  }

  // ---- validation: a failed attempt changes nothing but the attempt count.
  if (interaction.kind !== "timer_expired") {
    const v = contract.validate?.(screen, interaction, state0, ctx) ?? { ok: true as const };
    if (!v.ok) {
      const attempts = (state0.attempts[screen.screenKey] ?? 0) + 1;
      return {
        ok: false,
        state: { ...state0, attempts: { ...state0.attempts, [screen.screenKey]: attempts } },
        failure: { code: v.code, message: v.message },
        events: [{ name: "validation_failed", screen_key: screen.screenKey, detail: { outcome: v.code } }],
      };
    }
  }

  // ---- apply: contract → legacy canonical tracker → effects.
  const out =
    interaction.kind === "timer_expired"
      ? { state: { ...state0, visitedScreens: state0.visitedScreens.includes(screen.screenKey) ? state0.visitedScreens : [...state0.visitedScreens, screen.screenKey] } }
      : contract.apply(screen, interaction, state0, ctx);
  let state = applyCanonicalTracker(out.state, screen);
  state = applyEffects(state, [...(common.effects ?? []), ...(("effects" in out && out.effects) || [])], { declarations: decls, now });

  const settled = settle(model, state, now, decls);
  state = settled.state;
  const events: AnalyticsDraft[] = [...(("events" in out && out.events) || []), ...settled.events];

  // ---- Mission Trail (F6): a marker on this screen saves evidence mid-mission.
  const evidence: EvidenceDraft[] = [];
  if (common.trail) {
    const t = common.trail;
    const inputText = ("inputText" in out ? out.inputText : null) ?? null;
    const description = t.fromInput ? inputText : (t.description ?? null);
    if (t.type === "physical" || description) {
      evidence.push({
        key: t.key,
        type: t.type,
        title: t.title,
        description,
        screen_key: screen.screenKey,
        relation: t.relatesTo?.relation ?? null,
        related_key: t.relatesTo?.key ?? null,
      });
      events.push({ name: "trail_saved", screen_key: screen.screenKey, detail: { source: t.type } });
    }
  }

  const response = ("response" in out && out.response) || null;
  if (response && !state.respondedScreens.includes(response.key)) {
    state = { ...state, respondedScreens: [...state.respondedScreens, response.key] };
  }

  const completed = isComplete(model, state, now);
  const stayed = Boolean("stay" in out && out.stay);
  const nextScreenKey = stayed
    ? screen.screenKey
    : resolveNext(model, screen, state, now, {
        eventGoto: settled.eventGoto,
        contractRoute: ("route" in out && out.route) || null,
      });

  const entered = completed ? { state, events: [] } : enter(model, state, screen.screenKey, nextScreenKey, now);
  state = entered.state;
  events.push(...entered.events);
  if (completed) events.push({ name: "mission_completed" });

  return { ok: true, state, nextScreenKey, completed, stayed, response, evidence, events };
}

// --------------------------------------------------------------- start ----

/** A small, seedable PRNG (mulberry32) — reproducible draws from a stored seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T extends { weight: number }>(items: T[], next: () => number): T | null {
  const total = items.reduce((n, i) => n + i.weight, 0);
  if (total <= 0) return null;
  let r = next() * total;
  for (const i of items) {
    r -= i.weight;
    if (r < 0) return i;
  }
  return items[items.length - 1] ?? null;
}

/**
 * Initialise a run: declared defaults, then the approved variant, then pool
 * draws — all from one server-generated seed, so pause/resume and later logic
 * always see the same variant and the same draws (§3). Idempotent: a run that
 * already has a seed is returned unchanged.
 */
export function startRun(
  model: MissionModel,
  state0: MissionStateData,
  firstScreenKey: string | null,
  now: Date,
  seed: number,
  childAgeYears: number | null = null,
): { state: MissionStateData; events: AnalyticsDraft[] } {
  if (state0.seed !== null) return { state: state0, events: [] };
  const decls = declarations(model);
  const next = rng(seed);
  const events: AnalyticsDraft[] = [];
  let state: MissionStateData = {
    ...state0,
    seed,
    variables: { ...initialVariables(decls), ...state0.variables },
  };
  state = mark(state, "start", now);
  if (firstScreenKey) state = mark(state, `screen:${firstScreenKey}`, now);

  const eligible = model.definition.variants.filter(
    (v) => !v.ageBand || childAgeYears === null || (childAgeYears >= v.ageBand.min && childAgeYears <= v.ageBand.max),
  );
  const variant = weighted(eligible, next);
  if (variant) {
    state = applyEffects(
      { ...state, variant: variant.id },
      Object.entries(variant.values).map(([k, value]) => ({ op: "set", var: k, value })),
      { declarations: decls, now },
    );
    events.push({ name: "variant_assigned", detail: { variant: variant.id } });
  }

  for (const pool of model.definition.pools) {
    const candidates = pool.items.filter((i) => !i.when || evaluate(i.when, { state, now }));
    const picked: string[] = [];
    const remaining = [...candidates];
    for (let n = 0; n < pool.pick && remaining.length; n++) {
      const item = weighted(remaining, next);
      if (!item) break;
      picked.push(item.id);
      remaining.splice(remaining.indexOf(item), 1);
    }
    const d = decls.find((x) => x.key === pool.storeAs);
    const value = d && d.type !== "list" ? (picked[0] ?? null) : picked;
    state = applyEffects(state, [{ op: "set", var: pool.storeAs, value }], { declarations: decls, now });
  }

  if (firstScreenKey) {
    events.push({ name: "screen_entered", screen_key: firstScreenKey, detail: { screen_type: screenByKey(model, firstScreenKey)?.type ?? "unknown" } });
  }
  return { state, events };
}
