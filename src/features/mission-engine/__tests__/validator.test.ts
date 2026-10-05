import { describe, expect, it } from "vitest";
import { buildModel } from "../definition";
import { validateMission } from "../validator";
import type { MissionScreen } from "../navigation";

const sc = (screenKey: string, type: MissionScreen["type"], sequence: number, configuration: Record<string, unknown> = {}, title: string | null = "T"): MissionScreen =>
  ({ screenKey, type, title, body: null, sequence, configuration });
const done = sc("end", "completion", 99, { message: "Done" });
const rule = { type: "screen_reached", screenKey: "last" };
const codes = (screens: MissionScreen[], definition: unknown = {}, r: unknown = rule, ctx = {}) =>
  validateMission(buildModel({ definition, screens, completionRule: r }), ctx).issues.map((i) => i.code);

describe("automated mission QA — each check fires on the mission it is for", () => {
  const ok = [sc("a", "content", 1, { next: "last" }), sc("last", "content", 2, { next: "end" }), done];

  it("a well-formed mission has no blocking issues", () => {
    expect(validateMission(buildModel({ definition: {}, screens: ok, completionRule: rule })).issues.filter((i) => i.severity === "blocking")).toEqual([]);
  });

  it.each([
    ["no_screens", [], {}, rule],
    ["broken_reference", [sc("a", "content", 1, { next: "ghost" }), done], {}, rule],
    ["dead_end", [sc("a", "content", 1), done], {}, rule],
    ["duplicate_sequence", [sc("a", "content", 1, { next: "last" }), sc("last", "content", 1, { next: "end" }), done], {}, rule],
    ["invalid_config", [sc("a", "choice", 1, { options: [] }), done], {}, rule],
    ["unknown_screen_type", [{ ...sc("a", "content", 1, { next: "end" }), type: "teleporter" as never }, done], {}, rule],
    ["no_completion_rule", ok, {}, null],
    ["no_completion_screen", [sc("a", "content", 1, { next: "last" }), sc("last", "content", 2, { next: "a" })], {}, rule],
    ["unreachable_screen", [sc("a", "content", 1, { next: "last" }), sc("orphan", "content", 2, { next: "last" }), sc("last", "content", 3, { next: "end" }), done], {}, rule],
    ["cannot_reach_complete", [sc("a", "content", 1, { next: "b" }), sc("b", "content", 2, { next: "a" }), done], {}, rule],
    ["undeclared_variable", [sc("a", "content", 1, { next: "last", effects: [{ op: "increment", var: "ghost" }] }), sc("last", "content", 2, { next: "end" }), done], {}, rule],
    ["invalid_effect", [sc("a", "content", 1, { next: "last", effects: [{ op: "toggle", var: "n" }] }), sc("last", "content", 2, { next: "end" }), done], { variables: [{ key: "n", type: "number" }] }, rule],
    ["unsatisfiable_condition", [sc("a", "content", 1, { next: "last", routes: [{ when: { ref: { var: "mood" }, op: "eq", value: "angry" }, to: "last" }] }), sc("last", "content", 2, { next: "end" }), done], { variables: [{ key: "mood", type: "enum", values: ["calm"] }] }, rule],
    ["non_persisted_state", [sc("a", "content", 1, { next: "last", effects: [{ op: "set", var: "tmp", value: true }] }), sc("last", "content", 2, { next: "end", routes: [{ when: { ref: { var: "tmp" }, op: "eq", value: true }, to: "end" }] }), done], { variables: [{ key: "tmp", type: "boolean", persist: "screen" }] }, rule],
    ["unlock_without_condition", [sc("a", "content", 1, { next: "last" }), sc("last", "content", 2, { next: "end", requires: { ref: { unlocked: "nowhere" }, op: "exists" } }), done], {}, rule],
    ["reveal_without_trigger", [sc("d", "choice", 1, { prompt: "?", options: [{ id: "x", label: "X", next: "r" }, { id: "y", label: "Y", next: "r" }] }), sc("r", "reveal", 2, { concealedPrompt: "?", revealedBody: "b", condition: { type: "choice_equals", screenKey: "d", optionId: "zzz" }, next: "last" }), sc("last", "content", 3, { next: "end" }), done], {}, rule],
    ["handoff_without_return", [sc("h", "handoff", 1, { location: "Here", steps: ["x"], returnInstruction: " ", next: "last" }), sc("last", "content", 2, { next: "end" }), done], {}, rule],
    ["missing_asset", [sc("a", "content", 1, { next: "last", media: [{ asset: "photo" }] }), sc("last", "content", 2, { next: "end" }), done], {}, rule],
    ["incomplete_variant", ok, { variables: [{ key: "n", type: "number" }, { key: "m", type: "number" }], variants: [{ id: "a", label: "A", values: { n: 1 } }, { id: "b", label: "B", values: { n: 1, m: 2 } }] }, rule],
    ["conflicting_dependency", [sc("a", "content", 1, { next: "g" }), sc("g", "content", 2, { next: "last", requires: { ref: { unlocked: "k" }, op: "exists" }, otherwise: "last" }), sc("last", "content", 3, { next: "end" }), done], { unlocks: [{ key: "k", when: { ref: { visited: "g" }, op: "exists" } }] }, rule],
  ] as const)("%s", (code, screens, definition, r) => {
    expect(codes(screens as MissionScreen[], definition, r)).toContain(code);
  });

  it("missing convergence: one branch never comes back together", () => {
    const screens = [
      sc("d", "choice", 1, { prompt: "?", convergeAt: "meet", options: [{ id: "x", label: "X", next: "meet" }, { id: "y", label: "Y", next: "last" }] }),
      sc("meet", "content", 2, { next: "last" }), sc("last", "content", 3, { next: "end" }), done,
    ];
    expect(codes(screens)).toContain("missing_convergence");
  });

  it("bypassable required content: a completing path skips a required screen", () => {
    const screens = [
      sc("d", "choice", 1, { prompt: "?", options: [{ id: "x", label: "X", next: "must" }, { id: "y", label: "Y", next: "last" }] }),
      sc("must", "response", 2, { prompt: "Why?", required: true, next: "last" }), sc("last", "content", 3, { next: "end" }), done,
    ];
    expect(codes(screens)).toContain("bypassable_required_content");
  });

  it("accessibility: media without text alternatives is blocking", () => {
    const screens = [sc("a", "content", 1, { next: "last", media: [{ asset: "pic" }, { asset: "clip" }] }), sc("last", "content", 2, { next: "end" }), done];
    const c = codes(screens, {}, rule, { assets: [{ key: "pic", kind: "image" }, { key: "clip", kind: "audio" }] });
    expect(c).toEqual(expect.arrayContaining(["missing_alt_text", "missing_transcript"]));
  });

  it("language: gamification vocabulary is flagged", () => {
    const screens = [sc("a", "content", 1, { next: "last" }, "Earn 10 points!"), sc("last", "content", 2, { next: "end" }), done];
    expect(codes(screens)).toContain("gamification_language");
  });
});

describe("age and child-language checks backed by WLA authority (D-102)", () => {
  const sc2 = (screenKey: string, type: string, sequence: number, configuration: unknown, title: string | null = "T", body: string | null = null) =>
    ({ screenKey, type: type as never, title, body, sequence, configuration });
  const m = (body: string, definition: Record<string, unknown> = {}) => buildModel({
    definition: { completion: { ref: { visited: "a" }, op: "exists" }, ...definition },
    screens: [sc2("a", "content", 1, { next: "end" }, "Start", body), sc2("end", "completion", 2, { message: "Done" })],
    completionRule: null,
  });
  const codes = (model: ReturnType<typeof m>, ages?: { min: number; max: number }) => validateMission(model, { ages }).issues.map((i) => `${i.severity}:${i.code}`);

  it("blocks a mission age range outside WLA's 7–15", () => {
    expect(codes(m("Hello."), { min: 5, max: 9 })).toContain("blocking:age_range_outside_platform");
    expect(codes(m("Hello."), { min: 8, max: 12 })).not.toContain("blocking:age_range_outside_platform");
  });
  it("blocks a variant age band outside 7–15", () => {
    const model = m("Hello.", { variables: [{ key: "n", type: "number", visibility: "hidden", default: 1 }], variants: [{ id: "young", label: "Young", ageBand: { min: 4, max: 6 }, values: { n: 1 } }] });
    expect(codes(model, { min: 7, max: 11 })).toContain("blocking:age_band_outside_platform");
  });
  it("flags judging language and bubbly exclamations as advisory", () => {
    expect(codes(m("That is the correct answer."))).toContain("advisory:judging_language");
    expect(codes(m("Amazing!! Brilliant!"))).toContain("advisory:bubbly_language");
    expect(codes(m("What did you notice about the list?"))).not.toContain("advisory:judging_language");
  });
  it("says plainly that reading-level rules are not applied (OPEN-15)", () => {
    expect(codes(m("Hello."))).toContain("advisory:language_rules_pending");
  });
});
