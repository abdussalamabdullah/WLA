import { evaluate } from "./conditions";
import { contractFor } from "./contract";
import { commonOf, declarations, screenByKey, type MissionModel } from "./definition";
import { isRevealed, type MissionScreen } from "./navigation";
import { checkpointWait, timerRemaining } from "./runtime";
import type { MissionStateData } from "./schemas";

/**
 * F3 — THE PROJECTION: what the browser may know.
 *
 * The runtime holds the whole pinned model server-side (D-80). The page gets
 * exactly one screen, rewritten by this function — and nothing else. Found
 * while building the foundation (D-81): before it, the current screen's FULL
 * configuration was serialised into the page, so Six Names' unopened Evidence
 * text, its unlock condition and every `next` key were readable in the page
 * source before the child opened anything.
 *
 * Removed here: routing (routes, option and screen `next`), gating
 * (requires/otherwise), effects, conditions, contract secrets (answers), the
 * canonical tracker, hidden variables, the seed, fired events and the variant.
 * Added: a `view` of server-derived facts the components need.
 */

export type ScreenView = {
  revealed?: boolean;
  timerSeconds?: number | null;
  timerVisible?: boolean;
  canRetry?: boolean;
  attempts?: number;
  /** Seconds until a checkpoint stage opens. */
  waitSeconds?: number;
  /** A Trail marker on this screen, so the child knows what is kept. */
  trail?: { title: string; type: "digital" | "physical" } | null;
};

export type ProjectedScreen = MissionScreen & { view: ScreenView };

const SERVER_ONLY = ["routes", "requires", "otherwise", "effects", "next", "canonicalTracker", "condition", "convergeAt", "required"];

function withoutWhen(o: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...o };
  delete copy.when;
  return copy;
}

/**
 * F6 recall: what the child said or chose earlier, by screen key.
 *   {{response.<screen>}} — their own saved words (text only)
 *   {{choice.<screen>}}   — the label of the option they chose
 *   {{multi.<screen>}}    — the labels of the options they selected
 * The child sees only their own run's values; nothing here can name
 * another screen's hidden configuration.
 */
export type Recall = { responses?: Record<string, unknown> };

function recallText(model: MissionModel, state: MissionStateData, recall: Recall, kind: string, key: string): string {
  if (kind === "response") {
    const v = recall.responses?.[key];
    const text = v && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v;
    return typeof text === "string" ? text : "";
  }
  const screen = screenByKey(model, key);
  const options = ((screen?.configuration as { options?: { id: string; label: string }[] } | null)?.options ?? []);
  const label = (id: string) => options.find((o) => o.id === id)?.label ?? "";
  if (kind === "choice") return state.choices[key] ? label(state.choices[key]) : "";
  if (kind === "multi") return (state.multiChoices[key] ?? []).map(label).filter(Boolean).join(", ");
  return "";
}

function interpolate(text: string, vars: Record<string, unknown>, recalled: (kind: string, key: string) => string): string {
  return text
    .replace(/\{\{\s*var\.([a-z0-9_.]+)\s*\}\}/g, (_, k: string) => {
      const v = vars[k];
      if (v === undefined || v === null) return "";
      return Array.isArray(v) ? v.join(", ") : String(v);
    })
    .replace(/\{\{\s*(response|choice|multi)\.([a-z0-9_]+)\s*\}\}/g, (_, kind: string, k: string) => recalled(kind, k));
}

function deepInterpolate(value: unknown, vars: Record<string, unknown>, recalled: (kind: string, key: string) => string): unknown {
  if (typeof value === "string") return interpolate(value, vars, recalled);
  if (Array.isArray(value)) return value.map((v) => deepInterpolate(v, vars, recalled));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepInterpolate(v, vars, recalled)]));
  }
  return value;
}

/** Only variables declared visible (plus Six Names' legacy tracker, which is already client-side). */
export function visibleVariables(model: MissionModel, state: MissionStateData): Record<string, unknown> {
  const visible = new Set(declarations(model).filter((d) => d.visibility === "visible").map((d) => d.key));
  return Object.fromEntries(Object.entries(state.variables).filter(([k]) => visible.has(k)));
}

export function clientState(model: MissionModel, state: MissionStateData): MissionStateData {
  return {
    ...state,
    variables: visibleVariables(model, state),
    seed: null,
    firedEvents: [],
    variant: null,
    marks: {},
  };
}

export function projectScreen(
  model: MissionModel,
  screen: MissionScreen,
  state: MissionStateData,
  now: Date,
  recall: Recall = {},
): ProjectedScreen {
  const ctx = { model, now };
  const common = commonOf(screen);
  const contract = contractFor(screen.type);
  let config: Record<string, unknown> = { ...((screen.configuration ?? {}) as Record<string, unknown>) };

  if (contract?.project) config = contract.project(config, screen, state, ctx);
  for (const k of [...SERVER_ONLY, ...(contract?.secrets ?? [])]) {
    // `condition` on reveals is replaced (not removed) by the contract so the
    // schema stays valid; everything else simply goes.
    if (k === "condition" && screen.type === "reveal") continue;
    delete config[k];
  }

  // Mission Control v2 support: only items whose condition holds, without the condition.
  if (Array.isArray(config.support)) {
    config.support = (config.support as Record<string, unknown>[])
      .filter((i) => !i.when || evaluate(i.when, { state, now }))
      .map((i) => withoutWhen(i));
  }
  // Media blocks: only those whose condition holds (F7 resolves them to URLs).
  if (Array.isArray(config.media)) {
    config.media = (config.media as Record<string, unknown>[])
      .filter((m) => !m.when || evaluate(m.when, { state, now }))
      .map((m) => withoutWhen(m));
  }
  if (config.trail) delete config.trail;
  if (config.retry) config.retry = { allowed: Boolean(common.retry?.allowed) };

  const vars = visibleVariables(model, state);
  const projected = deepInterpolate(
    { title: screen.title, body: screen.body, configuration: config },
    vars,
    (kind, key) => recallText(model, state, recall, kind, key),
  ) as { title: string | null; body: string | null; configuration: Record<string, unknown> };

  const remaining = timerRemaining(screen, state, now);
  return {
    screenKey: screen.screenKey,
    type: screen.type,
    sequence: screen.sequence,
    title: projected.title,
    body: projected.body,
    configuration: projected.configuration,
    view: {
      revealed: screen.type === "reveal" ? isRevealed(screen, state, now) : undefined,
      timerSeconds: remaining,
      timerVisible: common.timer?.visible ?? false,
      canRetry: Boolean(common.retry?.allowed),
      attempts: state.attempts[screen.screenKey] ?? 0,
      waitSeconds: checkpointWait(model, screen.screenKey, state, now),
      trail: common.trail ? { title: common.trail.title, type: common.trail.type } : null,
    },
  };
}

export function projectCurrent(
  model: MissionModel,
  currentKey: string | null,
  state: MissionStateData,
  now: Date,
  recall: Recall = {},
): { screen: ProjectedScreen | null; state: MissionStateData } {
  const screen = screenByKey(model, currentKey);
  return {
    screen: screen ? projectScreen(model, screen, state, now, recall) : null,
    state: clientState(model, state),
  };
}
