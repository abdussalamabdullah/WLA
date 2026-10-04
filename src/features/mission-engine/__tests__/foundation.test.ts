import { describe, expect, it } from "vitest";
import { evaluate, conditionRefs, fromLegacyCompletion, fromLegacyReveal, type Condition } from "../conditions";
import { applyEffects, mergeFromStorage, readVariable, splitForStorage, type VariableDeclaration } from "../variables";
import { buildModel, type MissionModel } from "../definition";
import { EngineRefusal, startRun, step } from "../runtime";
import { clientState, projectScreen } from "../projection";
import { emptyMissionState, type MissionStateData } from "../schemas";
import type { MissionScreen } from "../navigation";

/*
 * THE ENGINE FOUNDATION (F1–F4, F8) — behaviour, not source text.
 */

const now = new Date("2026-10-04T12:00:00Z");
const at = (secondsAgo: number) => new Date(now.getTime() - secondsAgo * 1000).toISOString();
const S = (over: Partial<MissionStateData> = {}): MissionStateData => ({ ...emptyMissionState, ...over });
const ctx = (state: MissionStateData) => ({ state, now });
const v = (key: string, op: string, value?: unknown) => ({ ref: { var: key }, op, value }) as Condition;

// ─────────────────────────────────────────────────────────── F2 evaluator ──
describe("F2 — one condition evaluator", () => {
  const st = S({
    variables: { score: 3, name: "noor", ok: true, items: ["key", "map"], empty: [] },
    choices: { d1: "ask" },
    multiChoices: { m: ["a", "b"] },
    revealed: ["ev"],
    unlocked: ["door"],
    visitedScreens: ["intro"],
    respondedScreens: ["wrap"],
    confirmedHandoffs: ["h1"],
    firedEvents: ["rain"],
    attempts: { code: 2 },
    variant: "v2",
    marks: { start: at(120), "screen:x": at(30) },
  });

  it.each([
    [v("score", "eq", 3), true], [v("score", "eq", "3"), false], [v("score", "neq", 4), true],
    [v("score", "gt", 2), true], [v("score", "gte", 3), true], [v("score", "lt", 3), false], [v("score", "lte", 3), true],
    [v("name", "gt", 2), false], [v("score", "gt", "2"), false],
    [v("score", "exists"), true], [v("missing", "exists"), false], [v("missing", "not_exists"), true],
    [v("empty", "exists"), false], [v("ok", "exists"), true],
    [v("items", "contains", "map"), true], [v("items", "contains", "rope"), false], [v("name", "contains", "oo"), true],
    [v("name", "in", ["noor", "sam"]), true], [v("name", "in", "noor"), false],
    [v("missing", "eq", undefined), false], [v("missing", "neq", 1), true],
  ])("compare %j → %s", (c, expected) => {
    expect(evaluate(c, ctx(st))).toBe(expected);
  });

  it("reads every kind of state through refs", () => {
    const yes: Condition[] = [
      { ref: { choice: "d1" }, op: "eq", value: "ask" },
      { ref: { multi: "m" }, op: "contains", value: "b" },
      { ref: { revealed: "ev" }, op: "exists" },
      { ref: { unlocked: "door" }, op: "exists" },
      { ref: { visited: "intro" }, op: "exists" },
      { ref: { response: "wrap" }, op: "exists" },
      { ref: { handoff: "h1" }, op: "exists" },
      { ref: { event: "rain" }, op: "exists" },
      { ref: { attempts: "code" }, op: "gte", value: 2 },
      { ref: { variant: true }, op: "eq", value: "v2" },
      { ref: { elapsed: { since: "start" } }, op: "gte", value: 120 },
      { ref: { elapsed: { since: "screen:x" } }, op: "lt", value: 60 },
    ];
    for (const c of yes) expect(evaluate(c, ctx(st)), JSON.stringify(c)).toBe(true);
    expect(evaluate({ ref: { elapsed: { since: "never" } }, op: "gte", value: 0 }, ctx(st))).toBe(false);
  });

  it("composes with all / any / not, including empty groups", () => {
    expect(evaluate({ all: [v("score", "eq", 3), { ref: { choice: "d1" }, op: "eq", value: "ask" }] }, ctx(st))).toBe(true);
    expect(evaluate({ any: [v("score", "eq", 9), v("ok", "eq", true)] }, ctx(st))).toBe(true);
    expect(evaluate({ not: v("ok", "eq", true) }, ctx(st))).toBe(false);
    expect(evaluate({ all: [] }, ctx(st))).toBe(true);
    expect(evaluate({ any: [] }, ctx(st))).toBe(false);
    expect(evaluate({ always: true }, ctx(st))).toBe(true);
  });

  it("is total: malformed, unknown and pathological input is false, never a throw", () => {
    for (const bad of [null, undefined, 5, "x", [], {}, { ref: { nope: "x" }, op: "eq" }, { ref: { var: "score" }, op: "approx" }, { all: "x" }]) {
      expect(() => evaluate(bad, ctx(st))).not.toThrow();
      expect(evaluate(bad, ctx(st))).toBe(false);
    }
    let deep: unknown = v("ok", "eq", true);
    for (let i = 0; i < 100; i++) deep = { not: { not: deep } };
    expect(evaluate(deep, ctx(st))).toBe(false); // depth limit
  });

  it("lists the refs a condition reads (validator / inspector)", () => {
    const refs = conditionRefs({ all: [v("a", "eq", 1), { not: { ref: { choice: "d" }, op: "exists" } }] });
    expect(refs).toEqual([{ var: "a" }, { choice: "d" }]);
  });

  it("translates the legacy shapes instead of evaluating them separately", () => {
    expect(evaluate(fromLegacyReveal({ type: "child_action" }, "ev"), ctx(st))).toBe(true);
    expect(evaluate(fromLegacyReveal({ type: "choice_equals", screenKey: "d1", optionId: "ask" }, "z"), ctx(st))).toBe(true);
    expect(evaluate(fromLegacyReveal({ type: "response_exists", screenKey: "intro" }, "z"), ctx(st))).toBe(true);
    const rule = fromLegacyCompletion({ type: "conditions", conditions: [{ kind: "choice_exists", screenKey: "d1" }, { kind: "screen_visited", screenKey: "intro" }] });
    expect(evaluate(rule, ctx(st))).toBe(true);
    expect(fromLegacyCompletion(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────── F1 variables ──
describe("F1 — declared variables and effects", () => {
  const decls: VariableDeclaration[] = [
    { key: "score", type: "counter", min: 0, max: 5, visibility: "visible", persist: "run" },
    { key: "fuel", type: "resource", min: 0, max: 10, visibility: "visible", persist: "run" },
    { key: "mood", type: "enum", values: ["calm", "busy"], visibility: "visible", persist: "run" },
    { key: "lit", type: "boolean", visibility: "hidden", persist: "run" },
    { key: "bag", type: "list", maxItems: 2, visibility: "visible", persist: "run" },
    { key: "secret", type: "string", visibility: "hidden", persist: "run" },
  ];
  const run = (effects: unknown[], state = S()) => applyEffects(state, effects, { declarations: decls, now });

  it("applies each operation within its type and constraints", () => {
    const s = run([
      { op: "increment", var: "score", by: 9 }, // clamped to max 5
      { op: "decrement", var: "fuel", by: 3 }, // clamped to min 0
      { op: "set", var: "mood", value: "busy" },
      { op: "toggle", var: "lit" },
      { op: "add", var: "bag", value: "key" },
      { op: "add", var: "bag", value: "key" }, // add is set-like
      { op: "append", var: "bag", value: "map" },
      { op: "append", var: "bag", value: "rope" }, // maxItems 2
      { op: "unlock", key: "door" },
      { op: "mark", key: "lit_at" },
    ]);
    expect(s.variables).toMatchObject({ score: 5, fuel: 0, mood: "busy", lit: true, bag: ["key", "map"] });
    expect(s.unlocked).toEqual(["door"]);
    expect(s.marks.lit_at).toBe(now.toISOString());
    expect(run([{ op: "remove", var: "bag", value: "key" }], s).variables.bag).toEqual(["map"]);
  });

  it("ignores unknown variables, disallowed operations and wrongly typed values (the validator refuses them)", () => {
    const s = run([
      { op: "set", var: "nope", value: 1 },
      { op: "toggle", var: "score" },
      { op: "set", var: "mood", value: "furious" },
      { op: "set", var: "score", value: "7" },
      { op: "increment", var: "mood" },
      { op: "teleport", var: "score" },
    ]);
    expect(s.variables).toEqual({});
  });

  it("exposes Six Names' legacy tracker as tracker.<dimension>, read-only, without migrating it", () => {
    const s = S({ custom: { tracker: { clarity: "Purpose clear" } } });
    expect(readVariable(s, "tracker.clarity")).toBe("Purpose clear");
    expect(evaluate({ ref: { var: "tracker.clarity" }, op: "eq", value: "Purpose clear" }, ctx(s))).toBe(true);
  });

  it("hidden values, the seed, fired events and the variant are stored privately", () => {
    const s = S({ variables: { score: 2, secret: "x", lit: true }, seed: 42, firedEvents: ["rain"], variant: "v1" });
    const { publicState, privateData } = splitForStorage(s, decls);
    expect(publicState.variables).toEqual({ score: 2 });
    expect(publicState.seed).toBeNull();
    expect(publicState.firedEvents).toEqual([]);
    expect(JSON.stringify(publicState)).not.toContain("secret");
    expect(mergeFromStorage(publicState, privateData)).toMatchObject({
      variables: { score: 2, secret: "x", lit: true }, seed: 42, firedEvents: ["rain"], variant: "v1",
    });
  });
});

// ───────────────────────────────────────────── F3/F4/F8 runtime mechanics ──
const screen = (screenKey: string, type: MissionScreen["type"], sequence: number, configuration: Record<string, unknown> = {}, title: string | null = null): MissionScreen =>
  ({ screenKey, type, title, body: null, sequence, configuration });

function model(screens: MissionScreen[], definition: unknown = {}, rule: unknown = { type: "screen_reached", screenKey: "end" }): MissionModel {
  return buildModel({ definition, screens, completionRule: rule });
}

describe("F3 — routing, gating, unlocks and events", () => {
  const decls = [{ key: "fuel", type: "resource", min: 0, max: 10, default: 5, visibility: "visible" }];

  it("ordered routes: first match wins, falling back to next", () => {
    const m = model([
      screen("a", "content", 1, { next: "c", routes: [{ when: v("fuel", "lt", 3), to: "low" }, { when: v("fuel", "gte", 3), to: "b" }] }),
      screen("b", "content", 2), screen("c", "content", 3), screen("low", "content", 4),
    ], { variables: decls });
    const base = startRun(m, emptyMissionState, "a", now, 1).state;
    expect((step(m, base, "a", { kind: "visit", screenKey: "a" }, now) as { nextScreenKey: string }).nextScreenKey).toBe("b");
    const low = { ...base, variables: { fuel: 1 } };
    expect((step(m, low, "a", { kind: "visit", screenKey: "a" }, now) as { nextScreenKey: string }).nextScreenKey).toBe("low");
  });

  it("a gated screen is skipped until its condition holds", () => {
    const m = model([
      screen("a", "content", 1, { next: "secret" }),
      screen("secret", "content", 2, { requires: { ref: { unlocked: "door" }, op: "exists" }, otherwise: "hall" }),
      screen("hall", "content", 3),
    ]);
    expect((step(m, S(), "a", { kind: "visit", screenKey: "a" }, now) as { nextScreenKey: string }).nextScreenKey).toBe("hall");
    expect((step(m, S({ unlocked: ["door"] }), "a", { kind: "visit", screenKey: "a" }, now) as { nextScreenKey: string }).nextScreenKey).toBe("secret");
  });

  it("unlocks are gained once and never lost; events fire once, change state and can interrupt", () => {
    const m = model(
      [screen("a", "content", 1, { next: "b", effects: [{ op: "decrement", var: "fuel", by: 4 }] }), screen("b", "content", 2), screen("storm", "content", 3)],
      {
        variables: decls,
        unlocks: [{ key: "low_fuel_route", when: v("fuel", "lt", 3) }],
        events: [{ key: "storm", when: v("fuel", "lt", 3), effects: [{ op: "set", var: "fuel", value: 0 }], goto: "storm" }],
      },
    );
    const s0 = startRun(m, emptyMissionState, "a", now, 1).state;
    const r = step(m, s0, "a", { kind: "visit", screenKey: "a" }, now);
    if (!r.ok) throw new Error("refused");
    expect(r.state.unlocked).toEqual(["low_fuel_route"]);
    expect(r.state.firedEvents).toEqual(["storm"]);
    expect(r.state.variables.fuel).toBe(0);
    expect(r.nextScreenKey).toBe("storm");
    expect(r.events.map((e) => e.name)).toEqual(expect.arrayContaining(["unlock_gained", "event_fired", "screen_entered"]));
  });

  it("later consequences can depend on more than one earlier decision", () => {
    const m = model([
      screen("d1", "choice", 1, { prompt: "?", options: [{ id: "x", label: "X", next: "d2" }, { id: "y", label: "Y", next: "d2" }] }),
      screen("d2", "choice", 2, {
        prompt: "?",
        options: [{ id: "p", label: "P" }, { id: "q", label: "Q" }],
        routes: [{ when: { all: [{ ref: { choice: "d1" }, op: "eq", value: "y" }, { ref: { choice: "d2" }, op: "eq", value: "q" }] }, to: "rare" }],
        next: "usual",
      }),
      screen("usual", "content", 3), screen("rare", "content", 4),
    ]);
    const s1 = (step(m, S(), "d1", { kind: "choice", screenKey: "d1", optionId: "y" }, now) as { state: MissionStateData }).state;
    expect((step(m, s1, "d2", { kind: "choice", screenKey: "d2", optionId: "q" }, now) as { nextScreenKey: string }).nextScreenKey).toBe("rare");
    expect((step(m, s1, "d2", { kind: "choice", screenKey: "d2", optionId: "p" }, now) as { nextScreenKey: string }).nextScreenKey).toBe("usual");
  });

  it("an option can be withheld by condition and is refused if forged", () => {
    const m = model([screen("d", "choice", 1, { prompt: "?", options: [{ id: "a", label: "A" }, { id: "b", label: "B", when: { ref: { unlocked: "k" }, op: "exists" } }] })]);
    const p = projectScreen(m, m.screens[0], S(), now);
    expect((p.configuration as { options: unknown[] }).options).toHaveLength(1);
    const r = step(m, S(), "d", { kind: "choice", screenKey: "d", optionId: "b" }, now);
    expect(r.ok).toBe(false);
  });
});

describe("F4 — the interaction contract", () => {
  it("refuses an interaction kind the screen does not accept", () => {
    const m = model([screen("d", "choice", 1, { prompt: "?", options: [{ id: "a", label: "A" }] })]);
    expect(() => step(m, S(), "d", { kind: "visit", screenKey: "d" }, now)).toThrow(EngineRefusal);
    expect(() => step(m, S(), "other", { kind: "visit", screenKey: "other" }, now)).toThrow(EngineRefusal);
  });

  it("a validation failure moves nothing and counts an attempt", () => {
    const m = model([screen("r", "response", 1, { prompt: "?", maxLength: 5 })]);
    const r = step(m, S(), "r", { kind: "response", screenKey: "r", value: "far too long" }, now);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.state.attempts.r).toBe(1);
    expect(r.state.respondedScreens).toEqual([]);
    expect(r.events[0]).toMatchObject({ name: "validation_failed", detail: { outcome: "too_long" } });
  });

  it("retry clears this screen's input only, where the screen allows it (D-78)", () => {
    const m = model([screen("d", "choice", 1, { prompt: "?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], retry: { allowed: true } }), screen("x", "content", 2)]);
    const s = S({ choices: { d: "a", other: "z" } });
    const r = step(m, s, "d", { kind: "retry", screenKey: "d" }, now);
    if (!r.ok) throw new Error("refused");
    expect(r.state.choices).toEqual({ other: "z" });
    expect(r.nextScreenKey).toBe("d");
    const noRetry = model([screen("d", "choice", 1, { prompt: "?", options: [{ id: "a", label: "A" }] })]);
    expect(() => step(noRetry, s, "d", { kind: "retry", screenKey: "d" }, now)).toThrow(EngineRefusal);
  });

  it("a timer expiry is accepted only when server time agrees", () => {
    const m = model([screen("t", "content", 1, { next: "u", timer: { seconds: 60 } }), screen("u", "content", 2)]);
    expect(() => step(m, S({ marks: { "screen:t": at(10) } }), "t", { kind: "timer_expired", screenKey: "t" }, now)).toThrow(EngineRefusal);
    const r = step(m, S({ marks: { "screen:t": at(61) } }), "t", { kind: "timer_expired", screenKey: "t" }, now);
    expect(r.ok && r.nextScreenKey).toBe("u");
  });

  it("a checkpoint stage refuses interaction until its real-world interval has passed", () => {
    const m = model([screen("cp", "content", 1)], { checkpoints: [{ key: "day2", screenKey: "cp", label: "Day 2", availableAfter: { since: "start", seconds: 86400 } }] });
    const r = step(m, S({ marks: { start: at(3600) } }), "cp", { kind: "visit", screenKey: "cp" }, now);
    expect(r.ok).toBe(false);
    expect(step(m, S({ marks: { start: at(90000) } }), "cp", { kind: "visit", screenKey: "cp" }, now).ok).toBe(true);
  });

  it("a Trail marker saves evidence mid-mission, with relations by key", () => {
    const m = model([
      screen("p", "response", 1, { prompt: "Predict", next: "q", trail: { key: "prediction", title: "My prediction", type: "digital", fromInput: true } }),
      screen("q", "response", 2, { prompt: "Result", trail: { key: "result", title: "What happened", type: "digital", fromInput: true, relatesTo: { key: "prediction", relation: "result_of" } } }),
    ]);
    const r = step(m, S(), "p", { kind: "response", screenKey: "p", value: "It will sink" }, now);
    if (!r.ok) throw new Error("refused");
    expect(r.evidence).toEqual([expect.objectContaining({ key: "prediction", description: "It will sink", type: "digital" })]);
    const r2 = step(m, r.state, "q", { kind: "response", screenKey: "q", value: "It floated" }, now);
    if (!r2.ok) throw new Error("refused");
    expect(r2.evidence[0]).toMatchObject({ key: "result", related_key: "prediction", relation: "result_of" });
  });

  it("physical evidence is recorded, never given stored content it does not have", () => {
    const m = model([screen("h", "handoff", 1, { location: "Table", steps: ["Build"], returnInstruction: "Come back", trail: { key: "model", title: "Your model", type: "physical", description: "Keep your model." } })]);
    const r = step(m, S(), "h", { kind: "handoff", screenKey: "h" }, now);
    if (!r.ok) throw new Error("refused");
    expect(r.evidence[0]).toMatchObject({ type: "physical", description: "Keep your model." });
  });
});

describe("F8 — run initialisation: variants and controlled randomisation", () => {
  const def = {
    variables: [
      { key: "clue", type: "string", visibility: "hidden" },
      { key: "budget", type: "resource", min: 0, max: 100, visibility: "visible" },
      { key: "suspects", type: "list", visibility: "hidden" },
    ],
    variants: [
      { id: "a", label: "A", weight: 1, values: { clue: "red", budget: 20 } },
      { id: "b", label: "B", weight: 1, values: { clue: "blue", budget: 40 } },
      { id: "young", label: "Younger", weight: 1, ageBand: { min: 7, max: 8 }, values: { budget: 5 } },
    ],
    pools: [{ key: "who", items: [{ id: "ann" }, { id: "bo" }, { id: "cy", weight: 0 }], pick: 2, storeAs: "suspects" }],
  };
  const m = model([screen("s", "content", 1)], def);

  it("is reproducible from the seed, and idempotent", () => {
    const a = startRun(m, emptyMissionState, "s", now, 1234, 10).state;
    const b = startRun(m, emptyMissionState, "s", now, 1234, 10).state;
    expect(a.variant).toBe(b.variant);
    expect(a.variables).toEqual(b.variables);
    expect(startRun(m, a, "s", now, 999, 10).state).toBe(a); // already initialised
  });

  it("honours weights, exclusions and age bands", () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = startRun(m, emptyMissionState, "s", now, seed, 10).state;
      expect(["a", "b"]).toContain(s.variant); // 10-year-old never gets "young"
      expect(s.variables.suspects).toHaveLength(2);
      expect(s.variables.suspects).not.toContain("cy"); // weight 0
      expect(s.variables.clue).toBe(s.variant === "a" ? "red" : "blue");
    }
  });

  it("the browser never learns the variant, the seed or hidden values", () => {
    const s = startRun(m, emptyMissionState, "s", now, 7, 10).state;
    const c = clientState(m, s);
    expect(c.seed).toBeNull();
    expect(c.variant).toBeNull();
    expect(Object.keys(c.variables)).toEqual(["budget"]);
  });

  it("interpolates only visible variables into the child's screen", () => {
    const m2 = model([screen("s", "content", 1, {}, "Budget {{var.budget}} · clue {{var.clue}}")], def);
    const s = { ...startRun(m2, emptyMissionState, "s", now, 7, 10).state };
    const p = projectScreen(m2, m2.screens[0], s, now);
    expect(p.title).toMatch(/^Budget \d+ · clue $/);
  });
});
