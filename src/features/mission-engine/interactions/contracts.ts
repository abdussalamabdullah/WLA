import { evaluate } from "../conditions";
import { readVariable } from "../variables";
import type { ContractOutcome, InteractionContract, Validation } from "../contract";
import type { MissionScreen } from "../navigation";
import type { MissionInteraction, MissionStateData } from "../schemas";
import type { Json } from "@/types/database";
import {
  libraryConfigByType,
  type LibraryType,
  type WorkspaceDef,
} from "./schemas";

/**
 * THE INTERACTION LIBRARY — contracts (F4).
 *
 * Every library type takes one interaction, `submit`, whose `value` this file
 * checks on the server before anything changes. A contract never trusts the
 * shape the browser sends: ids must be ids the screen offers, lengths are
 * bounded, numbers are finite. A failed check costs an attempt and nothing
 * else (runtime.ts).
 *
 * Graded types match the value against `outcomes` (server-only) and report
 * which matched; see interactions/schemas.ts for the model.
 */

type Cfg<T extends LibraryType> = ReturnType<(typeof libraryConfigByType)[T]["parse"]>;

const ok: Validation = { ok: true };
const fail = (code: string, message: string): Validation => ({ ok: false, code, message });

function cfg<T extends LibraryType>(type: T, screen: MissionScreen): Cfg<T> {
  return libraryConfigByType[type].parse(screen.configuration ?? {}) as Cfg<T>;
}

const valueOf = (i: MissionInteraction): unknown => (i.kind === "submit" ? i.value : undefined);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStrings = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && x.length <= 200);
const visit = (s: MissionStateData, k: string): MissionStateData =>
  s.visitedScreens.includes(k) ? s : { ...s, visitedScreens: [...s.visitedScreens, k] };

type Outcome = { id: string; next?: string; effects: unknown[] };
type NoMatch = { mode: "retry" | "continue"; message: string; next?: string; effects: unknown[]; fallbackAfter?: number; fallbackNext?: string };

/**
 * Shared graded behaviour: find the matching outcome, else apply `onNoMatch`.
 * Returns a Validation for the no-match-retry case so the runtime counts it
 * as a failed attempt without changing anything else.
 */
function grade<O extends Outcome & { match: unknown }>(
  outcomes: O[],
  noMatch: NoMatch,
  matches: (m: O["match"]) => boolean,
  attempts: number,
): { outcome: O | null; noMatch: boolean; retry: Validation | null } {
  if (!outcomes.length) return { outcome: null, noMatch: false, retry: null };
  const hit = outcomes.find((o) => matches(o.match)) ?? null;
  if (hit) return { outcome: hit, noMatch: false, retry: null };
  const exhausted = noMatch.fallbackAfter !== undefined && attempts + 1 >= noMatch.fallbackAfter;
  if (noMatch.mode === "retry" && !exhausted) return { outcome: null, noMatch: true, retry: fail("no_match", noMatch.message) };
  return { outcome: null, noMatch: true, retry: null };
}

/** Build the outcome of a successful submit. */
function done(
  screen: MissionScreen,
  state: MissionStateData,
  value: unknown,
  opts: {
    outcome?: Outcome | null;
    noMatch?: NoMatch | null;
    storeAs?: string;
    stored?: unknown;
    effects?: unknown[];
    route?: string | null;
    inputText?: string | null;
    exhausted?: boolean;
    stay?: boolean;
    extraState?: (s: MissionStateData) => MissionStateData;
  },
): ContractOutcome {
  const k = screen.screenKey;
  let s = visit(state, k);
  const effects: unknown[] = [...(opts.effects ?? [])];
  let route: string | null = opts.route ?? null;
  let outcomeId: string | null = null;
  if (opts.outcome) {
    outcomeId = opts.outcome.id;
    effects.push(...opts.outcome.effects);
    route = opts.outcome.next ?? route;
  } else if (opts.noMatch) {
    outcomeId = "no_match";
    effects.push(...opts.noMatch.effects);
    route = (opts.exhausted ? opts.noMatch.fallbackNext : undefined) ?? opts.noMatch.next ?? route;
  }
  if (outcomeId) s = { ...s, outcomes: { ...s.outcomes, [k]: outcomeId } };
  if (opts.storeAs) effects.push({ op: "set", var: opts.storeAs, value: opts.stored ?? value });
  if (opts.extraState) s = opts.extraState(s);
  return {
    state: s,
    response: { key: k, value: (outcomeId ? { value, outcome: outcomeId } : value) as Json },
    effects,
    route,
    stay: opts.stay,
    inputText: opts.inputText ?? null,
    events: [{ name: "interaction_submitted", screen_key: k, detail: outcomeId ? { outcome: outcomeId, screen_type: screen.type } : { screen_type: screen.type } }],
  };
}

/** Normalise typed answers the same way for the child's input and the authored values. */
export function normaliseCode(v: string, n: { case: boolean; spaces: boolean; punctuation: boolean }): string {
  let s = v.normalize("NFKC").trim();
  if (n.case) s = s.toLocaleLowerCase("en-GB");
  if (n.punctuation) s = s.replace(/[\p{P}\p{S}]/gu, "");
  if (n.spaces) s = s.replace(/\s+/g, "");
  else s = s.replace(/\s+/g, " ");
  return s;
}

const sameArray = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * A library contract is assembled from: how to check the value (`check`), how
 * to grade it (`matches`, optional), and what to store. Everything else —
 * outcomes, no-match handling, storeAs, analytics — is shared.
 */
function graded<T extends LibraryType>(
  type: T,
  spec: {
    check: (value: unknown, c: Cfg<T>, state: MissionStateData, screen: MissionScreen) => Validation;
    matches?: (value: unknown, match: never, c: Cfg<T>) => boolean;
    stored?: (value: unknown, c: Cfg<T>) => unknown;
    inputText?: (value: unknown, c: Cfg<T>) => string | null;
    samples: (c: Cfg<T>) => unknown[];
    secrets?: string[];
    project?: InteractionContract["project"];
  },
): InteractionContract {
  const run = (screen: MissionScreen, i: MissionInteraction, state: MissionStateData) => {
    const c = cfg(type, screen);
    const value = valueOf(i);
    const o = (c as { outcomes?: (Outcome & { match: unknown })[] }).outcomes ?? [];
    const nm = (c as { onNoMatch?: NoMatch }).onNoMatch ?? null;
    const g = spec.matches && nm
      ? grade(o, nm, (m) => spec.matches!(value, m as never, c), state.attempts[screen.screenKey] ?? 0)
      : { outcome: null, noMatch: false, retry: null };
    const exhausted = Boolean(nm?.fallbackAfter !== undefined && (state.attempts[screen.screenKey] ?? 0) + 1 >= nm!.fallbackAfter!);
    return { c, value, g, nm, exhausted };
  };
  return {
    type,
    accepts: ["submit"],
    secrets: ["outcomes", "onNoMatch", "storeAs", ...(spec.secrets ?? [])],
    validate(screen, i, state) {
      if (i.kind !== "submit") return fail("wrong_kind", "That doesn't belong here.");
      const c = cfg(type, screen);
      const v = spec.check(i.value, c, state, screen);
      if (!v.ok) return v;
      return run(screen, i, state).g.retry ?? ok;
    },
    apply(screen, i, state) {
      const { c, value, g, nm, exhausted } = run(screen, i, state);
      return done(screen, state, value, {
        outcome: g.outcome,
        noMatch: g.noMatch ? nm : null,
        exhausted,
        storeAs: (c as { storeAs?: string }).storeAs,
        stored: spec.stored?.(value, c),
        inputText: spec.inputText?.(value, c) ?? null,
      });
    },
    project: spec.project,
    samples: (screen: MissionScreen) => spec.samples(cfg(type, screen)),
  };
}

// ---------------------------------------------------------------- types ----

const numeric_entry = graded("numeric_entry", {
  check(v, c) {
    if (typeof v !== "number" || !Number.isFinite(v)) return fail("not_a_number", "Enter a number.");
    if (c.min !== undefined && v < c.min) return fail("too_small", `Use a number from ${c.min}.`);
    if (c.max !== undefined && v > c.max) return fail("too_large", `Use a number up to ${c.max}.`);
    const scaled = v * 10 ** c.decimals;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-9) return fail("too_precise", c.decimals ? `Use up to ${c.decimals} decimal places.` : "Use a whole number.");
    return ok;
  },
  matches(v, m: { equals?: number; min?: number; max?: number; tolerance: number }) {
    const n = v as number;
    if (m.equals !== undefined && Math.abs(n - m.equals) > m.tolerance) return false;
    if (m.min !== undefined && n < m.min) return false;
    if (m.max !== undefined && n > m.max) return false;
    return true;
  },
  inputText: (v, c) => `${v}${c.unit ? ` ${c.unit}` : ""}`,
  samples: (c) => [...c.outcomes.map((o) => o.match.equals ?? o.match.min ?? o.match.max ?? c.min ?? 0), -987654].map((n) => Math.min(c.max ?? n, Math.max(c.min ?? n, n))),
});

const code_entry = graded("code_entry", {
  check(v, c) {
    if (typeof v !== "string" || v.trim() === "") return fail("empty", "Enter it first.");
    if (v.length > c.maxLength) return fail("too_long", `Keep it under ${c.maxLength} characters.`);
    return ok;
  },
  matches(v, m: { values: string[] }, c) {
    const typed = normaliseCode(v as string, c.normalise);
    return m.values.some((x) => normaliseCode(x, c.normalise) === typed);
  },
  // A passphrase or code is not evidence; only words and phrases may feed the Trail.
  inputText: (v, c) => (c.mode === "word" || c.mode === "phrase" ? (v as string) : null),
  stored: (v, c) => normaliseCode(v as string, c.normalise),
  samples: (c) => [...c.outcomes.map((o) => o.match.values[0]), "zz-no-such-code-zz"],
});

const token_sequence = graded("token_sequence", {
  check(v, c) {
    if (!isStrings(v, c.length)) return fail("invalid", "Choose the symbols in order.");
    if (v.length !== c.length) return fail("wrong_length", `Choose ${c.length} symbols.`);
    const ids = new Set(c.tokens.map((t) => t.id));
    if (!v.every((x) => ids.has(x))) return fail("unknown_token", "That symbol isn't available.");
    if (!c.allowRepeats && new Set(v).size !== v.length) return fail("repeat", "Use each symbol once.");
    return ok;
  },
  matches: (v, m: { sequences: string[][] }) => m.sequences.some((s) => sameArray(s, v as string[])),
  samples: (c) => [...c.outcomes.map((o) => o.match.sequences[0]), Array.from({ length: c.length }, (_, i) => c.tokens[(i * 7 + 1) % c.tokens.length].id)],
});

const arrange = graded("arrange", {
  check(v, c) {
    const ids = new Set(c.items.map((x) => x.id));
    if (c.mode === "sort") {
      if (!isRecord(v)) return fail("invalid", "Place the items.");
      const groups = new Set(c.groups.map((g) => g.id));
      for (const [k, g] of Object.entries(v)) {
        if (!ids.has(k) || typeof g !== "string" || !groups.has(g)) return fail("invalid", "That item or group isn't here.");
      }
      if (c.requireAll && Object.keys(v).length !== ids.size) return fail("incomplete", "Place every item first.");
      return ok;
    }
    if (!isStrings(v, c.items.length)) return fail("invalid", "Put the items in order.");
    if (new Set(v).size !== v.length || !v.every((x) => ids.has(x))) return fail("invalid", "That item isn't here.");
    if (c.requireAll && v.length !== ids.size) return fail("incomplete", "Place every item first.");
    return ok;
  },
  matches(v, m: { order?: string[]; groups?: Record<string, string> }) {
    if (m.order) return Array.isArray(v) && sameArray(m.order, v);
    if (m.groups) return isRecord(v) && Object.entries(m.groups).every(([k, g]) => v[k] === g) && Object.keys(v).length === Object.keys(m.groups).length;
    return false;
  },
  samples: (c) => {
    const ordered = c.items.map((x) => x.id);
    const sorted = Object.fromEntries(c.items.map((x) => [x.id, c.groups[0]?.id ?? ""]));
    const fromOutcomes = c.outcomes.map((o) => (c.mode === "sort" ? o.match.groups : o.match.order)).filter(Boolean);
    return [...fromOutcomes, c.mode === "sort" ? sorted : [...ordered].reverse()];
  },
});

const matching = graded("matching", {
  check(v, c) {
    if (!isRecord(v)) return fail("invalid", "Match the items.");
    const left = new Set(c.left.map((x) => x.id));
    const right = new Set(c.right.map((x) => x.id));
    for (const [l, r] of Object.entries(v)) if (!left.has(l) || typeof r !== "string" || !right.has(r)) return fail("invalid", "That item isn't here.");
    if (c.oneToOne && new Set(Object.values(v)).size !== Object.values(v).length) return fail("used_twice", "Use each match once.");
    if (c.requireAll && Object.keys(v).length !== left.size) return fail("incomplete", "Match every item first.");
    return ok;
  },
  matches: (v, m: { pairs: Record<string, string> }) =>
    isRecord(v) && Object.keys(v).length === Object.keys(m.pairs).length && Object.entries(m.pairs).every(([l, r]) => v[l] === r),
  samples: (c) => [...c.outcomes.map((o) => o.match.pairs), Object.fromEntries(c.left.map((l, i) => [l.id, c.right[(i + 1) % c.right.length].id]))],
});

function checkControls(v: unknown, controls: { id: string; min: number; max: number; step: number }[]): Validation {
  if (!isRecord(v)) return fail("invalid", "Set the controls.");
  for (const [k, n] of Object.entries(v)) {
    const ctl = controls.find((x) => x.id === k);
    if (!ctl || typeof n !== "number" || !Number.isFinite(n)) return fail("invalid", "That control isn't here.");
    if (n < ctl.min || n > ctl.max) return fail("out_of_range", `${k}: use ${ctl.min}–${ctl.max}.`);
    const steps = (n - ctl.min) / ctl.step;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) return fail("off_step", "That value isn't on the scale.");
  }
  if (Object.keys(v).length !== controls.length) return fail("incomplete", "Set every control.");
  return ok;
}
const controlEffects = (v: unknown, controls: { id: string; storeAs?: string }[]) =>
  controls.filter((c) => c.storeAs).map((c) => ({ op: "set", var: c.storeAs!, value: (v as Record<string, number>)[c.id] }));
/** Which variable a control feeds is the server's business. */
const withoutBindings = (config: Record<string, unknown>) => ({
  ...config,
  controls: (config.controls as Record<string, unknown>[]).map((c) => { const copy = { ...c }; delete copy.storeAs; return copy; }),
});
const controlDefaults = (controls: { id: string; min: number; default?: number }[]) =>
  Object.fromEntries(controls.map((c) => [c.id, c.default ?? c.min]));

const allocateBase = graded("allocate", {
  check(v, c) {
    const r = checkControls(v, c.controls);
    if (!r.ok) return r;
    if (c.total !== undefined && c.mode !== "sliders") {
      const sum = Object.values(v as Record<string, number>).reduce((a, b) => a + b, 0);
      if (sum > c.total + 1e-9) return fail("over_total", `That uses more than ${c.total}.`);
      if (c.exact && Math.abs(sum - c.total) > 1e-9) return fail("under_total", `Use all ${c.total}.`);
    }
    return ok;
  },
  matches: (v, m: { ranges: Record<string, { min?: number; max?: number }> }) =>
    Object.entries(m.ranges).every(([k, r]) => {
      const n = (v as Record<string, number>)[k];
      return n !== undefined && (r.min === undefined || n >= r.min) && (r.max === undefined || n <= r.max);
    }),
  samples: (c) => {
    const d = controlDefaults(c.controls);
    if (c.total !== undefined && c.exact && c.mode !== "sliders") {
      // An exact total: put it all on the first control the range allows.
      let left = c.total;
      for (const ctl of c.controls) { const n = Math.min(ctl.max, Math.max(ctl.min, left)); d[ctl.id] = n; left -= n; }
    }
    return [d];
  },
  project: (config) => withoutBindings(config),
});
const allocate: InteractionContract = {
  ...allocateBase,
  apply(screen, i, state, ctx) {
    const out = allocateBase.apply(screen, i, state, ctx);
    const c = cfg("allocate", screen);
    return { ...out, effects: [...(out.effects ?? []), ...controlEffects(valueOf(i), c.controls)] };
  },
};

const inventory: InteractionContract = {
  type: "inventory",
  accepts: ["submit"],
  secrets: ["storeAs"],
  validate(screen, i, state, ctx) {
    const c = cfg("inventory", screen);
    const v = valueOf(i);
    const available = new Set(c.items.filter((x) => !x.when || evaluate(x.when, { state, now: ctx.now })).map((x) => x.id));
    if (!isStrings(v, c.items.length)) return fail("invalid", "Choose what to take.");
    if (!v.every((x) => available.has(x)) || new Set(v).size !== v.length) return fail("unavailable", "That isn't available.");
    if (v.length < c.min) return fail("too_few", `Take at least ${c.min}.`);
    if (v.length > c.max) return fail("too_many", `You can carry ${c.max}.`);
    return ok;
  },
  apply(screen, i, state) {
    const c = cfg("inventory", screen);
    return done(screen, state, valueOf(i), { storeAs: c.storeAs });
  },
  project(config, _screen, state, ctx) {
    // Items behind a condition are withheld, not shown disabled.
    const items = (config.items as Record<string, unknown>[])
      .filter((x) => !x.when || evaluate(x.when, { state, now: ctx.now }))
      .map((x) => ({ id: x.id, label: x.label, description: x.description }));
    // What the child already carries — only ids offered here, so a hidden
    // variable can say no more than this screen already shows.
    const held = config.keepPrevious !== false && typeof config.storeAs === "string" ? readVariable(state, config.storeAs) : null;
    const carried = Array.isArray(held) ? held.filter((x) => items.some((i) => i.id === x)) : [];
    return { ...config, items, carried };
  },
  samples: (screen) => {
    const c = cfg("inventory", screen);
    return [c.items.slice(0, Math.max(c.min, 1)).map((x) => x.id)];
  },
};

const compare: InteractionContract = {
  type: "compare",
  accepts: ["submit"],
  secrets: ["storeAs"],
  validate(screen, i) {
    const c = cfg("compare", screen);
    const v = valueOf(i);
    if (!isRecord(v)) return fail("invalid", "Compare the options.");
    if (c.pick && !c.options.some((o) => o.id === v.pick)) return fail("no_pick", c.pickPrompt ?? "Choose one.");
    if (c.mode === "matrix") {
      if (!isRecord(v.ratings)) return fail("invalid", "Rate each option.");
      for (const [k, n] of Object.entries(v.ratings)) {
        const [o, cr] = k.split(".");
        if (!c.options.some((x) => x.id === o) || !c.criteria.some((x) => x.id === cr) || typeof n !== "number" || !Number.isInteger(n) || n < 0 || n >= c.scale.length) {
          return fail("invalid", "That rating isn't on the scale.");
        }
      }
      if (Object.keys(v.ratings).length !== c.options.length * c.criteria.length) return fail("incomplete", "Rate every option on every row.");
    }
    return ok;
  },
  apply(screen, i, state) {
    const c = cfg("compare", screen);
    const v = valueOf(i) as { pick?: string };
    const option = c.options.find((o) => o.id === v.pick);
    return done(screen, state, v, {
      storeAs: c.storeAs,
      stored: v.pick ?? null,
      effects: option?.effects ?? [],
      route: option?.next ?? null,
      // A pick is a decision: recorded where the evaluator reads choices.
      extraState: (s) => (v.pick ? { ...s, choices: { ...s.choices, [screen.screenKey]: v.pick } } : s),
    });
  },
  project(config) {
    return { ...config, options: (config.options as Record<string, unknown>[]).map((o) => ({ id: o.id, label: o.label, description: o.description })) };
  },
  samples: (screen) => {
    const c = cfg("compare", screen);
    const ratings = c.mode === "matrix" ? Object.fromEntries(c.options.flatMap((o) => c.criteria.map((cr) => [`${o.id}.${cr.id}`, 0]))) : undefined;
    return c.pick ? c.options.map((o) => ({ pick: o.id, ratings })) : [{ ratings }];
  },
};

const hotspot = graded("hotspot", {
  check(v, c) {
    const ids = new Set(c.regions.map((r) => r.id));
    if (c.mode === "annotate") {
      if (!isRecord(v)) return fail("invalid", "Add your notes.");
      for (const [k, n] of Object.entries(v)) {
        if (!ids.has(k) || typeof n !== "string") return fail("invalid", "That part isn't here.");
        if (n.length > c.noteMaxLength) return fail("too_long", `Keep each note under ${c.noteMaxLength} characters.`);
      }
      if (Object.values(v).filter((n) => (n as string).trim()).length < c.minSelect) return fail("too_few", `Add at least ${c.minSelect} note${c.minSelect === 1 ? "" : "s"}.`);
      return ok;
    }
    if (!isStrings(v, c.regions.length) || !v.every((x) => ids.has(x)) || new Set(v).size !== v.length) return fail("invalid", "That part isn't here.");
    if (v.length < c.minSelect) return fail("too_few", `Choose at least ${c.minSelect}.`);
    if (v.length > c.maxSelect) return fail("too_many", `Choose up to ${c.maxSelect}.`);
    return ok;
  },
  matches: (v, m: { regions: string[] }) => Array.isArray(v) && v.length === m.regions.length && m.regions.every((r) => v.includes(r)),
  inputText: (v, c) => (c.mode === "annotate" && isRecord(v) ? Object.entries(v).filter(([, n]) => String(n).trim()).map(([k, n]) => `${c.regions.find((r) => r.id === k)?.label}: ${n}`).join("\n") : null),
  samples: (c) =>
    c.mode === "annotate"
      ? [Object.fromEntries(c.regions.slice(0, Math.max(1, c.minSelect)).map((r) => [r.id, "Sample note"]))]
      : [...c.outcomes.map((o) => o.match.regions), c.regions.slice(-Math.max(1, c.minSelect)).map((r) => r.id)],
});

const sketch: InteractionContract = {
  type: "sketch",
  accepts: ["submit"],
  validate(screen, i) {
    const c = cfg("sketch", screen);
    const v = valueOf(i);
    if (v === "paper") return ok;
    if (!isRecord(v) || !Array.isArray(v.strokes)) return fail("invalid", "Draw something, or use paper.");
    const strokes = v.strokes as unknown[];
    if (strokes.length === 0) return fail("empty", "Draw something, or use paper.");
    if (strokes.length > c.maxStrokes) return fail("too_many", "That drawing is too detailed to keep. Try fewer lines.");
    let points = 0;
    for (const s of strokes) {
      if (!Array.isArray(s) || s.length % 2 || !s.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000)) return fail("invalid", "That drawing couldn't be read.");
      points += s.length / 2;
    }
    if (points > 6000) return fail("too_many", "That drawing is too detailed to keep. Try fewer lines.");
    return ok;
  },
  apply(screen, i, state) {
    const c = cfg("sketch", screen);
    const v = valueOf(i);
    // Unless the mission keeps drawings, only the fact of drawing is recorded.
    return done(screen, state, c.store ? v : v === "paper" ? "paper" : "drawn", {});
  },
  samples: () => ["paper"],
};

function mapCheck(v: unknown, c: Cfg<"map">): Validation {
  const ids = new Set(c.nodes.map((n) => n.id));
  if (c.mode === "network") {
    if (!Array.isArray(v) || v.length > c.maxLinks) return fail("invalid", "Make your links.");
    const seen = new Set<string>();
    for (const l of v) {
      if (!Array.isArray(l) || l.length !== 2 || !ids.has(l[0]) || !ids.has(l[1]) || l[0] === l[1]) return fail("invalid", "That link isn't possible.");
      const k = pairKey(l[0], l[1]);
      if (seen.has(k)) return fail("duplicate", "That link is already made.");
      seen.add(k);
    }
    if (v.length === 0) return fail("empty", "Make at least one link.");
    return ok;
  }
  if (!isStrings(v, c.maxSteps + 1) || v.length < 2) return fail("invalid", "Build your route.");
  if (!v.every((x) => ids.has(x))) return fail("invalid", "That place isn't on the map.");
  if (c.start && v[0] !== c.start) return fail("wrong_start", "Start where the route begins.");
  if (c.end && v[v.length - 1] !== c.end) return fail("wrong_end", "Finish where the route ends.");
  if (c.edges.length) {
    const allowed = new Set(c.edges.map(([a, b]) => pairKey(a, b)));
    for (let n = 1; n < v.length; n++) if (!allowed.has(pairKey(v[n - 1], v[n]))) return fail("no_link", "Those two places aren't connected.");
  }
  return ok;
}
const map = graded("map", {
  check: (v, c) => mapCheck(v, c),
  matches(v, m: { path?: string[]; visits?: string[]; links?: [string, string][] }) {
    if (m.path) return Array.isArray(v) && sameArray(m.path, v);
    if (m.visits) return Array.isArray(v) && m.visits.every((x) => v.includes(x));
    if (m.links && Array.isArray(v)) {
      const got = new Set((v as [string, string][]).map(([a, b]) => pairKey(a, b)));
      return got.size === m.links.length && m.links.every(([a, b]) => got.has(pairKey(a, b)));
    }
    return false;
  },
  samples: (c) => {
    if (c.mode === "network") return [...c.outcomes.map((o) => o.match.links).filter(Boolean), [[c.nodes[0].id, c.nodes[1].id]]];
    // A shortest route from start to end through the allowed edges.
    const start = c.start ?? c.nodes[0].id;
    const end = c.end ?? c.nodes[c.nodes.length - 1].id;
    const adj = new Map<string, string[]>();
    for (const [a, b] of c.edges) { adj.set(a, [...(adj.get(a) ?? []), b]); adj.set(b, [...(adj.get(b) ?? []), a]); }
    const prev = new Map<string, string>([[start, ""]]);
    const q = [start];
    while (q.length) { const n = q.shift()!; for (const m of c.edges.length ? adj.get(n) ?? [] : c.nodes.map((x) => x.id)) if (!prev.has(m)) { prev.set(m, n); q.push(m); } }
    const route: string[] = [];
    for (let n: string | undefined = end; n; n = prev.get(n) || undefined) route.unshift(n);
    return [...c.outcomes.map((o) => o.match.path).filter(Boolean), route[0] === start ? route : [start, end]];
  },
});

const pattern_grid = graded("pattern_grid", {
  check(v, c) {
    const size = c.rows * c.cols;
    if (!isStrings(v, size) || v.length !== size) return fail("invalid", "Fill in the grid.");
    const palette = new Set(c.palette.map((p) => p.id));
    for (let n = 0; n < size; n++) {
      if (v[n] !== "" && !palette.has(v[n])) return fail("invalid", "That isn't one of the pieces.");
      if (c.given[n] && v[n] !== c.given[n]) return fail("given_changed", "Some squares are fixed.");
    }
    return ok;
  },
  matches: (v, m: { grid: string[] }) => sameArray(m.grid, v as string[]),
  samples: (c) => [...c.outcomes.map((o) => o.match.grid), Array.from({ length: c.rows * c.cols }, (_, n) => c.given[n] || "")],
});

/** Simulation: `{ action: "run", values }` stays and updates readouts; `{ action: "done" }` moves on. */
const simulation: InteractionContract = {
  type: "simulation",
  accepts: ["submit"],
  secrets: ["storeAs"],
  validate(screen, i, state) {
    const c = cfg("simulation", screen);
    const v = valueOf(i);
    if (!isRecord(v)) return fail("invalid", "Set it up and run it.");
    if (v.action === "run") return checkControls(v.values, c.controls);
    if (v.action === "done") {
      const runs = ((state.custom[screen.screenKey] as { runs?: number } | undefined)?.runs ?? 0);
      return runs >= c.minRuns ? ok : fail("not_run", `Run it ${c.minRuns === 1 ? "once" : `${c.minRuns} times`} first.`);
    }
    return fail("invalid", "Set it up and run it.");
  },
  apply(screen, i, state) {
    const c = cfg("simulation", screen);
    const v = valueOf(i) as { action: "run" | "done"; values?: Record<string, number> };
    const k = screen.screenKey;
    if (v.action === "run") {
      const prev = (state.custom[k] as { runs?: number } | undefined)?.runs ?? 0;
      return {
        state: { ...state, custom: { ...state.custom, [k]: { runs: prev + 1, values: v.values } } },
        effects: controlEffects(v.values, c.controls),
        stay: true,
        events: [{ name: "interaction_submitted", screen_key: k, detail: { screen_type: "simulation", outcome: "run" } }],
      };
    }
    const last = (state.custom[k] as { values?: unknown } | undefined)?.values ?? null;
    return done(screen, state, last, {});
  },
  project(config, screen, state, ctx) {
    // Readouts are evaluated HERE, against the variables the last run set;
    // the page receives the text that applies, never the model behind it.
    const k = screen.screenKey;
    const run = state.custom[k] as { runs?: number; values?: Record<string, number> } | undefined;
    const readouts = run?.runs
      ? (config.readouts as { when: unknown; text: string }[]).filter((r) => evaluate(r.when, { state, now: ctx.now })).map((r) => r.text)
      : [];
    return { ...withoutBindings(config), readouts: [{ when: { always: true }, text: "…" }], current: { runs: run?.runs ?? 0, values: run?.values ?? null, readouts } };
  },
  samples: (screen) => {
    const c = cfg("simulation", screen);
    return [{ action: "run", values: controlDefaults(c.controls) }, { action: "done" }];
  },
};

/** Persistent workspace: `{ placements, links }` saved under the definition's workspace key. */
const workspace: InteractionContract = {
  type: "workspace",
  accepts: ["submit"],
  validate(screen, i, state, ctx) {
    const c = cfg("workspace", screen);
    const ws = ctx.model.definition.workspaces.find((w) => w.key === c.workspace);
    if (!ws) return fail("no_workspace", "This board isn't set up.");
    if (c.mode === "review") return ok;
    const v = valueOf(i);
    if (!isRecord(v) || !isRecord(v.placements)) return fail("invalid", "Arrange the board.");
    const available = new Set(availableObjects(ws, state, ctx.now).map((o) => o.id));
    const zones = new Set(ws.zones.map((z) => z.id));
    for (const [o, z] of Object.entries(v.placements)) {
      if (!available.has(o) || typeof z !== "string" || !zones.has(z)) return fail("invalid", "That piece or place isn't on the board.");
    }
    const links = v.links ?? [];
    if (!Array.isArray(links) || (!ws.links && links.length) || links.length > ws.maxLinks) return fail("invalid", "Those links can't be made here.");
    for (const l of links) if (!Array.isArray(l) || l.length !== 2 || !available.has(l[0]) || !available.has(l[1]) || l[0] === l[1]) return fail("invalid", "That link isn't possible.");
    const placements = v.placements as Record<string, unknown>;
    const missing = c.requirePlaced.filter((o) => !(o in placements));
    if (missing.length) return fail("incomplete", "Place the pieces this step needs first.");
    return ok;
  },
  apply(screen, i, state) {
    const c = cfg("workspace", screen);
    if (c.mode === "review") return done(screen, state, null, {});
    const v = valueOf(i) as { placements: Record<string, string>; links?: [string, string][] };
    const board = { placements: v.placements, links: v.links ?? [] };
    return done(screen, state, board, {
      extraState: (s) => ({ ...s, workspaces: { ...s.workspaces, [c.workspace]: board } }),
    });
  },
  project(config, _screen, state, ctx) {
    // The board travels with the screen: zones, the objects available NOW,
    // and the child's own saved arrangement.
    const ws = ctx.model.definition.workspaces.find((w) => w.key === config.workspace);
    if (!ws) return config;
    return {
      ...config,
      board: {
        label: ws.label,
        kind: ws.kind,
        zones: ws.zones,
        links: ws.links,
        maxLinks: ws.maxLinks,
        objects: availableObjects(ws, state, ctx.now).map((o) => ({ id: o.id, label: o.label, description: o.description })),
        saved: state.workspaces[ws.key] ?? { placements: {}, links: [] },
      },
    };
  },
  samples: (screen, model) => {
    // Every object that could be on the board, in the first zone: whatever a
    // step requires is then placed (objects not yet available are refused,
    // which the simulation treats as a miss and tries the next input).
    const c = cfg("workspace", screen);
    const ws = model.definition.workspaces.find((w) => w.key === c.workspace);
    if (!ws) return [null];
    const zone = ws.zones[0].id;
    const all = Object.fromEntries(ws.objects.map((o) => [o.id, zone]));
    const plain = Object.fromEntries(ws.objects.filter((o) => !o.when).map((o) => [o.id, zone]));
    return [{ placements: all, links: [] }, { placements: plain, links: [] }];
  },
};

export function availableObjects(ws: WorkspaceDef, state: MissionStateData, now: Date) {
  return ws.objects.filter((o) => !o.when || evaluate(o.when, { state, now }));
}

export const libraryContracts: Record<LibraryType, InteractionContract> = {
  numeric_entry,
  code_entry,
  token_sequence,
  arrange,
  matching,
  allocate,
  inventory,
  compare,
  hotspot,
  sketch,
  map,
  pattern_grid,
  simulation,
  workspace,
};
