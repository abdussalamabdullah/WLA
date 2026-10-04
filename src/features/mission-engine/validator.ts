import { conditionRefs, fromLegacyReveal, type Ref } from "./conditions";
import { contractFor } from "./contract";
import { commonOf, commonScreenConfig, missionDefinition, screenByKey, type MissionModel } from "./definition";
import type { MissionScreen } from "./navigation";
import { EngineRefusal, completionCondition, startRun, step } from "./runtime";
import { emptyMissionState, screenConfigByType, type MissionInteraction, type MissionStateData } from "./schemas";
import { acceptsValue, effect as effectSchema, opsByType, type VariableDeclaration } from "./variables";

/**
 * AUTOMATED MISSION QA (Enhancement Plan §12 "Automated mission QA", Part 6).
 *
 * Two layers over the canonical model (F8):
 *
 *   1. STATIC — configuration against schemas, references, declarations,
 *      effects, conditions, dependencies, assets, accessibility, language.
 *   2. SIMULATION — the real runtime (runtime.ts) plays the draft along every
 *      combination of decisions and sample inputs, bounded. Paths that cannot
 *      reach Complete, missing convergence, bypassable required content,
 *      reveals and unlocks that never happen and unreachable screens are
 *      facts about runs, so they are measured on runs.
 *
 * It runs while authoring (the builder shows every issue), before review and
 * before publish (the status action refuses on any blocking issue). It
 * supports, never replaces, the Build Brief's requirement to test every valid
 * route and pause/resume state by hand.
 */

export type Severity = "blocking" | "advisory";
export type Category = "structure" | "logic" | "content" | "assets" | "accessibility" | "language";

export type Issue = {
  code: string;
  severity: Severity;
  category: Category;
  screenKey: string | null;
  detail: string;
};

export type ValidationContext = {
  /** Mission media assets by key (F7), with accessibility metadata. */
  assets?: { key: string; kind: string; alt_text?: string | null; transcript?: string | null; captions?: boolean | null }[];
  /** Mission Kit resource titles, for materials links and handoff checklists. */
  kitTitles?: string[];
  /** Mission age range, for age-band checks. */
  ages?: { min: number; max: number } | null;
};

export type PathReport = {
  /** The decisions taken, e.g. "decision1=ask_about_list". */
  decisions: string[];
  screens: string[];
  outcome: "complete" | "stuck" | "dead_end" | "limit";
  detail?: string;
};

const issue = (severity: Severity, category: Category, code: string, screenKey: string | null, detail: string): Issue =>
  ({ code, severity, category, screenKey, detail });

// ------------------------------------------------------------ simulation ----

/** Every input worth trying on a screen. Contracts may offer their own samples. */
function sampleInputs(screen: MissionScreen, state: MissionStateData): MissionInteraction[] {
  const k = screen.screenKey;
  const c = (screen.configuration ?? {}) as Record<string, unknown>;
  const contract = contractFor(screen.type) as (ReturnType<typeof contractFor> & { samples?: (s: MissionScreen) => unknown[] }) | null;
  if (contract?.samples) return contract.samples(screen).map((value) => ({ kind: "submit" as const, screenKey: k, value }));
  switch (screen.type) {
    case "choice":
      return ((c.options as { id: string }[]) ?? []).map((o) => ({ kind: "choice" as const, screenKey: k, optionId: o.id }));
    case "multi_choice": {
      const ids = ((c.options as { id: string }[]) ?? []).map((o) => o.id);
      const n = typeof c.selectExactly === "number" ? c.selectExactly : 2;
      return [{ kind: "multi_choice" as const, screenKey: k, optionIds: ids.slice(0, n) }];
    }
    case "response":
      return [{ kind: "response" as const, screenKey: k, value: c.inputType === "confirm" ? true : "Sample answer" }];
    case "tracker": {
      const dims = (c.dimensions as { id: string }[]) ?? [];
      return [{ kind: "tracker" as const, screenKey: k, positions: Object.fromEntries(dims.map((d) => [d.id, 0])) }];
    }
    case "reveal":
      return state.revealed.includes(k) ? [{ kind: "visit" as const, screenKey: k }] : [{ kind: "reveal" as const, screenKey: k }];
    case "handoff":
    case "prepare":
      return [{ kind: "handoff" as const, screenKey: k }];
    default:
      return [{ kind: "visit" as const, screenKey: k }];
  }
}

/**
 * Play the mission along every branch (bounded). Variants are explored too:
 * each variant is a separate starting state. Time is frozen far in the future
 * so timed and checkpoint stages are open.
 */
export function simulate(model: MissionModel, opts: { maxPaths?: number; maxSteps?: number } = {}): PathReport[] {
  const maxPaths = opts.maxPaths ?? 400;
  const maxSteps = opts.maxSteps ?? Math.max(60, model.screens.length * 4);
  const first = model.screens[0]?.screenKey ?? null;
  const reports: PathReport[] = [];
  if (!first) return reports;
  const later = new Date("2100-01-01T00:00:00Z");
  const starts: MissionStateData[] = [];
  const variants = model.definition.variants.length ? model.definition.variants : [null];
  for (const v of variants) {
    let s = startRun(model, emptyMissionState, first, new Date("2000-01-01T00:00:00Z"), 1).state;
    if (v) {
      const forced = { ...model, definition: { ...model.definition, variants: [{ ...v, weight: 1 }] } };
      s = startRun(forced, emptyMissionState, first, new Date("2000-01-01T00:00:00Z"), 1).state;
    }
    starts.push(s);
  }

  type Frame = { state: MissionStateData; key: string; screens: string[]; decisions: string[]; steps: number };
  const stack: Frame[] = starts.map((state) => ({ state, key: first, screens: [first], decisions: [], steps: 0 }));
  while (stack.length && reports.length < maxPaths) {
    const f = stack.pop()!;
    const screen = screenByKey(model, f.key);
    if (!screen) {
      reports.push({ decisions: f.decisions, screens: f.screens, outcome: "stuck", detail: `"${f.key}" does not exist` });
      continue;
    }
    if (f.steps > maxSteps) {
      reports.push({ decisions: f.decisions, screens: f.screens, outcome: "limit", detail: "Too many steps — a loop with no way out?" });
      continue;
    }
    const inputs = sampleInputs(screen, f.state);
    let progressed = false;
    for (const input of inputs) {
      let r;
      try {
        r = step(model, f.state, f.key, input, later);
      } catch (e) {
        if (e instanceof EngineRefusal) continue;
        throw e;
      }
      if (!r.ok) continue;
      progressed = true;
      const decisions = input.kind === "choice" ? [...f.decisions, `${f.key}=${input.optionId}`] : f.decisions;
      if (r.completed) {
        reports.push({ decisions, screens: f.screens, outcome: "complete" });
        continue;
      }
      const next = r.nextScreenKey;
      if (!next) {
        reports.push({ decisions, screens: f.screens, outcome: "dead_end", detail: `Nothing follows "${f.key}" and the mission is not complete.` });
        continue;
      }
      stack.push({
        state: r.state,
        key: next,
        screens: next === f.key ? f.screens : [...f.screens, next],
        decisions,
        steps: f.steps + 1,
      });
    }
    if (!progressed) {
      reports.push({ decisions: f.decisions, screens: f.screens, outcome: "stuck", detail: `No valid input moves the child on from "${f.key}".` });
    }
  }
  return reports;
}

// ---------------------------------------------------------------- static ----

function refsIn(value: unknown, out: Ref[] = []): Ref[] {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((v) => refsIn(v, out));
    return out;
  }
  const o = value as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (k === "when" || k === "requires" || k === "completion") conditionRefs(v, out);
    else if (k === "routes" && Array.isArray(v)) v.forEach((r) => conditionRefs((r as { when?: unknown }).when, out));
    else refsIn(v, out);
  }
  return out;
}

const BANNED = /\b(score|scores|points|badge|badges|streak|streaks|leaderboard|ranking|rank|winner|you win|you lose|level up|xp)\b/i;

function childText(s: MissionScreen): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key = "") => {
    if (typeof v === "string") {
      if (!/^(next|to|otherwise|screenKey|key|id|var|op|type|asset|fromResponse|resource|kind|since)$/.test(key)) out.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (!["when", "requires", "routes", "effects", "condition"].includes(k)) walk(x, k);
  };
  walk(s.title);
  walk(s.body);
  walk(s.configuration);
  return out;
}

export function validateMission(model: MissionModel, ctx: ValidationContext = {}): { issues: Issue[]; paths: PathReport[] } {
  const issues: Issue[] = [];
  const screens = model.screens;
  const def = model.definition;
  const keys = new Set(screens.map((s) => s.screenKey));
  const decls = new Map<string, VariableDeclaration>(def.variables.map((d) => [d.key, d]));
  const unlockKeys = new Set(def.unlocks.map((u) => u.key));
  const assets = new Map((ctx.assets ?? []).map((a) => [a.key, a]));

  // ---- the definition itself
  const parsedDef = missionDefinition.safeParse(def);
  if (!parsedDef.success) issues.push(issue("blocking", "structure", "invalid_definition", null, parsedDef.error.issues[0]?.message ?? "Invalid definition."));
  if (!screens.length) {
    issues.push(issue("blocking", "structure", "no_screens", null, "This version has no screens yet. Add at least one screen before publishing."));
    return { issues, paths: [] };
  }

  const seen = new Map<number, string>();
  for (const s of screens) {
    if (seen.has(s.sequence)) issues.push(issue("blocking", "structure", "duplicate_sequence", s.screenKey, `Shares position ${s.sequence} with "${seen.get(s.sequence)}".`));
    seen.set(s.sequence, s.screenKey);
  }

  const dupVar = def.variables.map((d) => d.key).filter((k, i, a) => a.indexOf(k) !== i);
  for (const k of new Set(dupVar)) issues.push(issue("blocking", "logic", "duplicate_variable", null, `Variable "${k}" is declared twice.`));

  const checkRef = (r: Ref, where: string | null, usedOn: string | null) => {
    if ("var" in r) {
      if (r.var.startsWith("tracker.")) return;
      const d = decls.get(r.var);
      if (!d) issues.push(issue("blocking", "logic", "undeclared_variable", where, `Uses variable "${r.var}", which is not declared.`));
      else if (d.persist === "screen" && usedOn !== null && where !== usedOn) {
        issues.push(issue("blocking", "logic", "non_persisted_state", where, `Reads "${r.var}", which is cleared when the child leaves the screen that sets it. Make it persist for the run.`));
      }
    }
    for (const k of ["choice", "multi", "response", "visited", "revealed", "handoff", "attempts"] as const) {
      if (k in r) {
        const target = (r as Record<string, string>)[k];
        if (!keys.has(target)) issues.push(issue("blocking", "logic", "unknown_screen_in_condition", where, `A condition refers to "${target}", which is not a screen in this version.`));
      }
    }
    if ("unlocked" in r && !unlockKeys.has(r.unlocked)) {
      const viaEffect = JSON.stringify(screens.map((s) => s.configuration)).includes(`"key":"${r.unlocked}"`) || JSON.stringify(def.events).includes(`"key":"${r.unlocked}"`);
      if (!viaEffect) issues.push(issue("blocking", "logic", "unlock_without_condition", where, `Waits for unlock "${r.unlocked}", which nothing can ever grant.`));
    }
    if ("event" in r && !def.events.some((e) => e.key === r.event)) {
      issues.push(issue("blocking", "logic", "unknown_event", where, `Refers to event "${r.event}", which is not defined.`));
    }
  };

  const checkEffects = (effects: unknown, where: string | null) => {
    if (!Array.isArray(effects)) return;
    for (const raw of effects) {
      const e = effectSchema.safeParse(raw);
      if (!e.success) {
        issues.push(issue("blocking", "logic", "invalid_effect", where, "An effect is not in a recognised form."));
        continue;
      }
      if (e.data.op === "unlock" || e.data.op === "mark") continue;
      const d = decls.get(e.data.var);
      if (!d) {
        issues.push(issue("blocking", "logic", "undeclared_variable", where, `Changes "${e.data.var}", which is not declared.`));
        continue;
      }
      const allowed = d.operations ?? opsByType[d.type];
      if (!allowed.includes(e.data.op)) issues.push(issue("blocking", "logic", "invalid_effect", where, `"${e.data.op}" is not allowed on ${d.type} "${d.key}".`));
      if (e.data.op === "set" && !acceptsValue(d, e.data.value)) issues.push(issue("blocking", "logic", "invalid_effect", where, `"${d.key}" cannot be set to ${JSON.stringify(e.data.value)}.`));
    }
  };

  const unsatisfiable = (c: unknown, where: string | null) => {
    const walk = (n: unknown): void => {
      if (!n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (Array.isArray(o.all)) {
        o.all.forEach(walk);
        // eq on the same variable with two different values can never both hold
        const eqs = o.all.filter((x): x is { ref: { var: string }; op: string; value: unknown } =>
          !!x && typeof x === "object" && (x as { op?: string }).op === "eq" && !!(x as { ref?: { var?: string } }).ref?.var);
        const byVar = new Map<string, string>();
        for (const e of eqs) {
          const prev = byVar.get(e.ref.var);
          const val = JSON.stringify(e.value);
          if (prev !== undefined && prev !== val) issues.push(issue("blocking", "logic", "unsatisfiable_condition", where, `Requires "${e.ref.var}" to equal two different values at once.`));
          byVar.set(e.ref.var, val);
        }
        return;
      }
      if (Array.isArray(o.any)) return o.any.forEach(walk);
      if ("not" in o) return walk(o.not);
      const r = o.ref as Record<string, unknown> | undefined;
      if (!r || typeof r.var !== "string") return;
      const d = decls.get(r.var);
      if (!d) return;
      const op = o.op as string;
      const value = o.value;
      if (["gt", "gte", "lt", "lte"].includes(op) && !["number", "counter", "resource"].includes(d.type)) {
        issues.push(issue("blocking", "logic", "unsatisfiable_condition", where, `Compares ${d.type} "${d.key}" with "${op}", which only works on numbers.`));
      }
      if (d.type === "enum" && op === "eq" && !(d.values ?? []).includes(String(value))) {
        issues.push(issue("blocking", "logic", "unsatisfiable_condition", where, `"${d.key}" can never be "${String(value)}" — not one of its values.`));
      }
      if (typeof value === "number" && typeof d.max === "number" && (op === "gt" ? value >= d.max : op === "gte" ? value > d.max : op === "eq" ? value > d.max : false)) {
        issues.push(issue("blocking", "logic", "unsatisfiable_condition", where, `"${d.key}" can never exceed its maximum of ${d.max}.`));
      }
      if (typeof value === "number" && typeof d.min === "number" && (op === "lt" ? value <= d.min : op === "lte" ? value < d.min : op === "eq" ? value < d.min : false)) {
        issues.push(issue("blocking", "logic", "unsatisfiable_condition", where, `"${d.key}" can never go below its minimum of ${d.min}.`));
      }
      if (op === "contains" && d.type !== "list" && d.type !== "string") {
        issues.push(issue("blocking", "logic", "unsatisfiable_condition", where, `"contains" needs a list or text; "${d.key}" is ${d.type}.`));
      }
    };
    walk(c);
  };

  // Which screen sets each screen-scoped variable (for non_persisted_state).
  const setters = new Map<string, string>();
  for (const s of screens) {
    for (const e of commonOf(s).effects ?? []) {
      const v = (e as { var?: string }).var;
      if (v && decls.get(v)?.persist === "screen") setters.set(v, s.screenKey);
    }
  }

  for (const s of screens) {
    const contract = contractFor(s.type);
    if (!contract) {
      issues.push(issue("blocking", "structure", "unknown_screen_type", s.screenKey, `"${s.type}" is not a screen type the Academy can render.`));
      continue;
    }
    const schema = (screenConfigByType as Record<string, { safeParse: (x: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }>)[s.type];
    const parsed = schema?.safeParse(s.configuration);
    if (schema && !parsed?.success) {
      const first = parsed?.error?.issues[0];
      issues.push(issue("blocking", "structure", "invalid_config", s.screenKey, `${first?.path.join(".") || "configuration"}: ${first?.message}`));
    }
    const common = commonScreenConfig.safeParse(s.configuration ?? {});
    if (!common.success) issues.push(issue("blocking", "structure", "invalid_config", s.screenKey, common.error.issues[0]?.message ?? "Invalid configuration."));
    const c = commonOf(s);
    const cfg = (s.configuration ?? {}) as Record<string, unknown>;

    // references
    const targets: [string, string][] = [];
    if (typeof cfg.next === "string" && cfg.next) targets.push(["next", cfg.next]);
    if (typeof c.otherwise === "string") targets.push(["otherwise", c.otherwise]);
    for (const r of c.routes ?? []) targets.push(["route", r.to]);
    if (Array.isArray(cfg.options)) for (const o of cfg.options as { next?: string }[]) if (o.next) targets.push(["option", o.next]);
    for (const [kind, t] of targets) {
      if (!keys.has(t)) issues.push(issue("blocking", "structure", "broken_reference", s.screenKey, `A ${kind} goes to "${t}", which is not a screen in this version.`));
    }

    // dead ends: an explicit way on is required (except the completion screen)
    const hasWayOn = typeof cfg.next === "string" || (c.routes?.length ?? 0) > 0 ||
      (Array.isArray(cfg.options) && (cfg.options as { next?: string }[]).length > 0 && (cfg.options as { next?: string }[]).every((o) => o.next));
    if (s.type !== "completion" && !hasWayOn) {
      issues.push(issue("blocking", "structure", "dead_end", s.screenKey, "Nothing follows this screen, and it is not the completion screen."));
    }
    if ((s.type === "choice") && Array.isArray(cfg.options) && (cfg.options as unknown[]).length < 2) {
      issues.push(issue("advisory", "content", "single_option_decision", s.screenKey, "A decision with one option is not a decision."));
    }

    // conditions and effects
    for (const r of refsIn(s.configuration)) checkRef(r, s.screenKey, s.screenKey);
    for (const r of refsIn(s.configuration)) {
      if ("var" in r && setters.has(r.var) && setters.get(r.var) !== s.screenKey) {
        issues.push(issue("blocking", "logic", "non_persisted_state", s.screenKey, `Reads "${r.var}", which is cleared when the child leaves "${setters.get(r.var)}".`));
      }
    }
    if (c.requires) unsatisfiable(c.requires, s.screenKey);
    for (const r of c.routes ?? []) unsatisfiable(r.when, s.screenKey);
    checkEffects(c.effects, s.screenKey);
    if (Array.isArray(cfg.options)) for (const o of cfg.options as { effects?: unknown; when?: unknown }[]) {
      checkEffects(o.effects, s.screenKey);
      if (o.when) unsatisfiable(o.when, s.screenKey);
    }

    // shadowed routes: an identical earlier condition makes a later route unreachable
    const seenRoutes = new Set<string>();
    for (const r of c.routes ?? []) {
      const k = JSON.stringify(r.when);
      if (seenRoutes.has(k)) issues.push(issue("advisory", "logic", "shadowed_route", s.screenKey, `A route to "${r.to}" can never be taken: an earlier route has the same condition.`));
      seenRoutes.add(k);
    }

    // reveals must be triggerable
    if (s.type === "reveal") {
      const cond = fromLegacyReveal(cfg.condition, s.screenKey);
      for (const r of conditionRefs(cond)) checkRef(r, s.screenKey, null);
      const raw = cfg.condition as { type?: string; screenKey?: string; optionId?: string } | undefined;
      if (raw?.type === "choice_equals") {
        const target = screenByKey(model, raw.screenKey);
        const opts = ((target?.configuration as { options?: { id: string }[] })?.options ?? []).map((o) => o.id);
        if (!opts.includes(String(raw.optionId))) issues.push(issue("blocking", "logic", "reveal_without_trigger", s.screenKey, `Opens on option "${raw.optionId}" of "${raw.screenKey}", which does not exist.`));
      }
    }

    // handoffs must say how to come back
    if (s.type === "handoff") {
      const ret = cfg.returnInstruction;
      if (typeof ret !== "string" || !ret.trim()) issues.push(issue("blocking", "content", "handoff_without_return", s.screenKey, "Tell the child when and how to come back."));
    }
    for (const id of ((cfg.requiredResourceIds as string[]) ?? [])) {
      if (ctx.kitTitles && !ctx.kitTitles.includes(id)) issues.push(issue("advisory", "assets", "missing_kit_resource", s.screenKey, `Needs Kit resource "${id}", which this version does not have.`));
    }

    // media and accessibility
    for (const m of c.media ?? []) {
      const a = assets.get(m.asset);
      if (!a) {
        issues.push(issue("blocking", "assets", "missing_asset", s.screenKey, `Uses media "${m.asset}", which is not in this version's assets.`));
        continue;
      }
      if (["image", "diagram", "map", "animation"].includes(a.kind) && !a.alt_text) issues.push(issue("blocking", "accessibility", "missing_alt_text", s.screenKey, `Media "${a.key}" needs a text alternative.`));
      if (a.kind === "audio" && !a.transcript) issues.push(issue("blocking", "accessibility", "missing_transcript", s.screenKey, `Audio "${a.key}" needs a text equivalent.`));
      if (a.kind === "video" && !a.captions && !a.transcript) issues.push(issue("blocking", "accessibility", "missing_captions", s.screenKey, `Video "${a.key}" needs captions or a transcript.`));
    }
    if (c.timer && c.timer.seconds < 20) issues.push(issue("advisory", "accessibility", "short_timer", s.screenKey, "Timers under 20 seconds are hard to read and act on."));
    if (c.timer && !c.timer.visible) issues.push(issue("advisory", "accessibility", "hidden_timer", s.screenKey, "A timed stage should show the time left."));

    // contract-level checks (device fallback, answers present...)
    const extra = (contract as { lint?: (s: MissionScreen) => Issue[] }).lint?.(s) ?? [];
    issues.push(...extra);

    // Mission Control materials point at real Kit resources
    for (const item of c.support ?? []) {
      if (item.kind === "materials" && item.resource && ctx.kitTitles && !ctx.kitTitles.includes(item.resource)) {
        issues.push(issue("advisory", "assets", "missing_kit_resource", s.screenKey, `Mission Control points at "${item.resource}", which is not in the Kit.`));
      }
      if (item.when) for (const r of conditionRefs(item.when)) checkRef(r, s.screenKey, null);
    }

    // language
    const texts = childText(s);
    for (const t of texts) {
      if (BANNED.test(t)) {
        issues.push(issue("advisory", "language", "gamification_language", s.screenKey, `"${t.match(BANNED)?.[0]}" — WLA does not use scores, points, badges, streaks or rankings.`));
        break;
      }
    }
    const words = texts.join(" ").split(/[.!?]\s/).map((x) => x.trim().split(/\s+/).length);
    if (words.some((n) => n > 35)) issues.push(issue("advisory", "language", "long_sentence", s.screenKey, "A sentence runs past 35 words; consider splitting it for children."));
    if (!s.title && !["handoff", "completion", "reflection"].includes(s.type)) issues.push(issue("advisory", "content", "screen_without_title", s.screenKey, "This screen has no title."));
  }

  // ---- definition-level references
  for (const u of def.unlocks) { for (const r of conditionRefs(u.when)) checkRef(r, null, null); unsatisfiable(u.when, null); }
  for (const e of def.events) {
    for (const r of conditionRefs(e.when)) checkRef(r, null, null);
    unsatisfiable(e.when, null);
    checkEffects(e.effects, null);
    if (e.goto && !keys.has(e.goto)) issues.push(issue("blocking", "structure", "broken_reference", null, `Event "${e.key}" goes to "${e.goto}", which is not a screen.`));
  }
  for (const cp of def.checkpoints) if (!keys.has(cp.screenKey)) issues.push(issue("blocking", "structure", "broken_reference", null, `Checkpoint "${cp.key}" is on "${cp.screenKey}", which is not a screen.`));
  for (const p of def.pools) {
    const d = decls.get(p.storeAs);
    if (!d) issues.push(issue("blocking", "logic", "undeclared_variable", null, `Pool "${p.key}" stores into "${p.storeAs}", which is not declared.`));
    else if (p.pick > 1 && d.type !== "list") issues.push(issue("blocking", "logic", "invalid_effect", null, `Pool "${p.key}" draws ${p.pick} items into ${d.type} "${d.key}"; use a list.`));
    if (p.items.filter((i) => i.weight > 0).length < p.pick) issues.push(issue("blocking", "logic", "pool_too_small", null, `Pool "${p.key}" cannot draw ${p.pick} items.`));
  }
  // variants: complete and consistent
  if (def.variants.length) {
    const keySets = def.variants.map((v) => Object.keys(v.values).sort().join(","));
    if (new Set(keySets).size > 1) issues.push(issue("blocking", "logic", "incomplete_variant", null, "Variants do not all set the same values — every variant must define the same things."));
    for (const v of def.variants) for (const [k, val] of Object.entries(v.values)) {
      const d = decls.get(k);
      if (!d) issues.push(issue("blocking", "logic", "incomplete_variant", null, `Variant "${v.id}" sets "${k}", which is not declared.`));
      else if (!acceptsValue(d, val)) issues.push(issue("blocking", "logic", "incomplete_variant", null, `Variant "${v.id}" sets "${k}" to an invalid value.`));
      if (v.ageBand && ctx.ages && (v.ageBand.max < ctx.ages.min || v.ageBand.min > ctx.ages.max)) {
        issues.push(issue("advisory", "content", "age_band_outside_mission", null, `Variant "${v.id}" is for ages ${v.ageBand.min}–${v.ageBand.max}, outside this mission's range.`));
      }
    }
    if (def.variants.every((v) => v.weight === 0)) issues.push(issue("blocking", "logic", "incomplete_variant", null, "Every variant has weight 0, so none can be chosen."));
  }
  // conflicting dependencies: a screen gated on an unlock that needs that screen first
  for (const s of screens) {
    const req = commonOf(s).requires;
    if (!req) continue;
    for (const r of conditionRefs(req)) {
      if (!("unlocked" in r)) continue;
      const u = def.unlocks.find((x) => x.key === r.unlocked);
      if (u && conditionRefs(u.when).some((x) => "visited" in x && x.visited === s.screenKey)) {
        issues.push(issue("blocking", "logic", "conflicting_dependency", s.screenKey, `Needs unlock "${u.key}", which needs this screen to be visited first.`));
      }
    }
  }

  // ---- completion
  const completion = completionCondition(model);
  if (!completion) issues.push(issue("blocking", "structure", "no_completion_rule", null, "This version has no completion rule, so the Academy cannot tell when it is finished."));
  else for (const r of conditionRefs(completion)) checkRef(r, null, null);
  if (!screens.some((s) => s.type === "completion")) {
    issues.push(issue("blocking", "structure", "no_completion_screen", null, "This version has no completion screen, so a learner could never finish it."));
  }

  // ---- simulation
  const paths = simulate(model);
  const blockingSoFar = issues.some((i) => i.severity === "blocking" && i.category === "structure");
  if (!blockingSoFar) {
    const visited = new Set(paths.flatMap((p) => p.screens));
    for (const s of screens) {
      if (s.type !== "completion" && !visited.has(s.screenKey)) {
        issues.push(issue("blocking", "structure", "unreachable_screen", s.screenKey, "No path from the first screen reaches this screen."));
      }
    }
    const bad = paths.filter((p) => p.outcome !== "complete");
    for (const p of bad.slice(0, 5)) {
      issues.push(issue("blocking", "structure", "cannot_reach_complete", p.screens[p.screens.length - 1] ?? null,
        `${p.detail ?? "This path never completes."}${p.decisions.length ? ` (after ${p.decisions.join(", ")})` : ""}`));
    }
    if (bad.length > 5) issues.push(issue("blocking", "structure", "cannot_reach_complete", null, `…and ${bad.length - 5} more paths that cannot reach Complete.`));

    const complete = paths.filter((p) => p.outcome === "complete");
    // required content cannot be bypassed
    for (const s of screens) {
      if (!(s.configuration as { required?: boolean } | null)?.required) continue;
      if (complete.some((p) => !p.screens.includes(s.screenKey))) {
        issues.push(issue("blocking", "logic", "bypassable_required_content", s.screenKey, "A completing path never reaches this required screen."));
      }
    }
    // convergence: every path from a decision reaches its declared meeting point
    for (const s of screens) {
      const at = (s.configuration as { convergeAt?: string } | null)?.convergeAt;
      if (!at) continue;
      if (!keys.has(at)) issues.push(issue("blocking", "structure", "broken_reference", s.screenKey, `Converges at "${at}", which is not a screen.`));
      else if (complete.some((p) => p.screens.includes(s.screenKey) && !p.screens.slice(p.screens.indexOf(s.screenKey)).includes(at))) {
        issues.push(issue("blocking", "logic", "missing_convergence", s.screenKey, `Not every branch from here comes back together at "${at}".`));
      }
    }
    // reveals and unlocks that never happen in any run
    const states = paths.length;
    if (states) {
      for (const u of def.unlocks) {
        // A cheap, honest check: replay the completing paths' final screens is
        // not enough, so this uses the runtime's own events.
        const gained = simulateGains(model).unlocks;
        if (!gained.has(u.key)) issues.push(issue("advisory", "logic", "unlock_never_gained", null, `Unlock "${u.key}" is never gained on any path the simulator played.`));
      }
      const fired = simulateGains(model).events;
      for (const e of def.events) if (!fired.has(e.key)) issues.push(issue("advisory", "logic", "event_never_fires", null, `Event "${e.key}" never fires on any path the simulator played.`));
    }
  }

  // de-duplicate identical issues
  const keyOf = (i: Issue) => `${i.code}|${i.screenKey}|${i.detail}`;
  const unique = [...new Map(issues.map((i) => [keyOf(i), i])).values()];
  return { issues: unique, paths };
}

/** Unlocks gained and events fired across simulated paths (memoised per model). */
const gainsCache = new WeakMap<MissionModel, { unlocks: Set<string>; events: Set<string> }>();
function simulateGains(model: MissionModel) {
  const hit = gainsCache.get(model);
  if (hit) return hit;
  const unlocks = new Set<string>();
  const events = new Set<string>();
  const first = model.screens[0]?.screenKey;
  if (first) {
    const later = new Date("2100-01-01T00:00:00Z");
    const stack: { state: MissionStateData; key: string; steps: number }[] = [
      { state: startRun(model, emptyMissionState, first, new Date("2000-01-01T00:00:00Z"), 1).state, key: first, steps: 0 },
    ];
    let budget = 2000;
    while (stack.length && budget-- > 0) {
      const f = stack.pop()!;
      f.state.unlocked.forEach((u) => unlocks.add(u));
      f.state.firedEvents.forEach((e) => events.add(e));
      const screen = screenByKey(model, f.key);
      if (!screen || f.steps > model.screens.length * 4) continue;
      for (const input of sampleInputs(screen, f.state)) {
        try {
          const r = step(model, f.state, f.key, input, later);
          if (!r.ok) continue;
          r.state.unlocked.forEach((u) => unlocks.add(u));
          r.state.firedEvents.forEach((e) => events.add(e));
          if (!r.completed && r.nextScreenKey) stack.push({ state: r.state, key: r.nextScreenKey, steps: f.steps + 1 });
        } catch {
          // refusals are reported by the main simulation
        }
      }
    }
  }
  const out = { unlocks, events };
  gainsCache.set(model, out);
  return out;
}

export function blocking(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.severity === "blocking");
}
