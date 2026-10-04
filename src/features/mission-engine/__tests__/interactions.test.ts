import { describe, expect, it } from "vitest";
import { buildModel, type MissionModel } from "../definition";
import { EngineRefusal, step } from "../runtime";
import { projectScreen, clientState } from "../projection";
import { emptyMissionState, screenConfigByType, type MissionStateData, type ScreenType } from "../schemas";
import { evaluate } from "../conditions";
import { validateMission, blocking } from "../validator";
import { screenCatalog } from "../interactions/catalog";
import { libraryTypes } from "../interactions/schemas";
import { normaliseCode } from "../interactions/contracts";
import type { MissionScreen } from "../navigation";

/*
 * THE INTERACTION LIBRARY (D-86) — behaviour through the real runtime,
 * projection and validator. Nothing here reads source text.
 */

const now = new Date("2026-10-04T12:00:00Z");
const S = (over: Partial<MissionStateData> = {}): MissionStateData => ({ ...emptyMissionState, ...over });

function screen(screenKey: string, type: string, configuration: unknown, sequence: number): MissionScreen {
  return { screenKey, type: type as ScreenType, title: null, body: null, sequence, configuration };
}

/** A one-interaction mission: the screen under test, then two endings. */
function model(type: string, config: Record<string, unknown>, definition: Record<string, unknown> = {}): MissionModel {
  return buildModel({
    definition: { completion: { ref: { visited: "end" }, op: "exists" }, ...definition },
    screens: [
      screen("lib", type, { next: "end", ...config }, 1),
      screen("other", "content", { next: "end" }, 2),
      screen("end", "content", { next: "done" }, 3),
      screen("done", "completion", { message: "Done" }, 4),
    ],
    completionRule: null,
  });
}
const submit = (m: MissionModel, value: unknown, state = S()) =>
  step(m, state, "lib", { kind: "submit", screenKey: "lib", value }, now);

const code = (extra: Record<string, unknown> = {}) =>
  model("code_entry", {
    prompt: "Enter it",
    outcomes: [
      { id: "bridge", match: { values: ["Open the Gate!"] }, next: "other", effects: [{ op: "unlock", key: "gate" }] },
      { id: "tunnel", match: { values: ["tunnel"] } },
    ],
    ...extra,
  });

describe("the catalog", () => {
  it("offers every library type with a template that parses as it stands", () => {
    for (const t of libraryTypes) {
      const entry = screenCatalog.find((e) => e.type === t);
      expect(entry, t).toBeDefined();
      const r = screenConfigByType[t].safeParse(entry!.template);
      expect(r.success, `${t}: ${!r.success && r.error.issues[0]?.message}`).toBe(true);
    }
  });

  it.each(libraryTypes)("the %s template passes QA and plays to completion", (t) => {
    const template = screenCatalog.find((e) => e.type === t)!.template;
    const definition: Record<string, unknown> = {
      variables: [{ key: "ramp_height", type: "number", visibility: "hidden", default: 1 }],
      workspaces: [{ key: "board", label: "Clue board", zones: [{ id: "here", label: "Here" }, { id: "there", label: "There" }], objects: [{ id: "a", label: "A clue" }] }],
    };
    const m = buildModel({
      definition: { completion: { ref: { visited: "end" }, op: "exists" }, ...definition },
      screens: [screen("lib", t, { next: "end", ...template }, 1), screen("end", "content", { next: "done" }, 2), screen("done", "completion", { message: "Done" }, 3)],
      completionRule: null,
    });
    const { issues, paths } = validateMission(m);
    expect(blocking(issues), JSON.stringify(blocking(issues))).toEqual([]);
    expect(paths.some((p) => p.outcome === "complete"), JSON.stringify(paths)).toBe(true);
  });
});

describe("graded input (code entry)", () => {
  it("never sends an answer, an outcome or a route to the page", () => {
    const m = code();
    const page = JSON.stringify(projectScreen(m, m.screens[0], S(), now));
    for (const secret of ["Open the Gate", "tunnel", "outcomes", "onNoMatch", "bridge", "other", "gate"]) {
      expect(page).not.toContain(secret);
    }
  });

  it("normalises case, spaces and punctuation the same way on both sides", () => {
    const n = { case: true, spaces: true, punctuation: true };
    expect(normaliseCode("  open THE gate ", n)).toBe(normaliseCode("Open the Gate!", n));
    const r = submit(code(), "OPEN the gate");
    expect(r.ok && r.nextScreenKey).toBe("other");
  });

  it("records the outcome, applies its effects and routes by it", () => {
    const r = submit(code(), "open the gate");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.outcomes.lib).toBe("bridge");
    expect(r.state.unlocked).toContain("gate");
    expect(evaluate({ ref: { outcome: "lib" }, op: "eq", value: "bridge" }, { state: r.state, now })).toBe(true);
    expect(r.response).toEqual({ key: "lib", value: { value: "open the gate", outcome: "bridge" } });
  });

  it("an outcome without a route continues by the screen's own next", () => {
    const r = submit(code(), "Tunnel");
    expect(r.ok && r.nextScreenKey).toBe("end");
  });

  it("a miss changes nothing but the attempt count, and says so calmly", () => {
    const r = submit(code(), "nope");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.state.attempts.lib).toBe(1);
    expect(r.state.outcomes).toEqual({});
    expect(r.failure.message.toLowerCase()).not.toMatch(/wrong|incorrect|fail/);
  });

  it("after the allowed attempts a recovery route opens (no dead end)", () => {
    const m = code({ onNoMatch: { mode: "retry", fallbackAfter: 3, fallbackNext: "other" } });
    let st = S();
    for (let n = 0; n < 2; n++) {
      const r = submit(m, "nope", st);
      expect(r.ok).toBe(false);
      st = r.state;
    }
    const r = submit(m, "nope", st);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextScreenKey).toBe("other");
    expect(r.state.outcomes.lib).toBe("no_match");
  });

  it("mission QA follows misses to the recovery route", () => {
    const m = code({ onNoMatch: { mode: "retry", fallbackAfter: 3, fallbackNext: "other" } });
    const { paths } = validateMission(m);
    expect(paths.some((p) => p.outcome === "complete" && p.screens.includes("other"))).toBe(true);
  });

  it("`continue` mode records the miss and moves on", () => {
    const r = submit(code({ onNoMatch: { mode: "continue", next: "other" } }), "nope");
    expect(r.ok && r.nextScreenKey).toBe("other");
  });

  it("refuses any interaction but submit", () => {
    expect(() => step(code(), S(), "lib", { kind: "choice", screenKey: "lib", optionId: "bridge" }, now)).toThrow(EngineRefusal);
    expect(() => step(code(), S(), "lib", { kind: "visit", screenKey: "lib" }, now)).toThrow(EngineRefusal);
  });

  it("retry clears the outcome along with the input", () => {
    const m = code({ retry: { allowed: true } });
    const first = step(m, S(), "lib", { kind: "submit", screenKey: "lib", value: "tunnel" }, now);
    expect(first.ok).toBe(true);
    // stand on the screen again with the outcome recorded, then retry
    const r = step(m, { ...(first.ok ? first.state : S()), outcomes: { lib: "tunnel" } }, "lib", { kind: "retry", screenKey: "lib" }, now);
    expect(r.ok && r.state.outcomes.lib).toBeUndefined();
  });
});

describe("forged and malformed input is refused by the contract", () => {
  const cases: [string, Record<string, unknown>, unknown][] = [
    ["numeric_entry", { prompt: "n", min: 0, max: 10 }, 11],
    ["numeric_entry", { prompt: "n" }, "7"],
    ["numeric_entry", { prompt: "n" }, 1.5],
    ["token_sequence", { prompt: "t", tokens: [{ id: "a", label: "A" }, { id: "b", label: "B" }], length: 2 }, ["a", "zz"]],
    ["token_sequence", { prompt: "t", tokens: [{ id: "a", label: "A" }, { id: "b", label: "B" }], length: 2, allowRepeats: false }, ["a", "a"]],
    ["arrange", { prompt: "a", items: [{ id: "x", label: "X" }, { id: "y", label: "Y" }] }, ["x", "x"]],
    ["arrange", { prompt: "a", items: [{ id: "x", label: "X" }, { id: "y", label: "Y" }] }, ["x"]],
    ["arrange", { prompt: "a", mode: "sort", items: [{ id: "x", label: "X" }, { id: "y", label: "Y" }], groups: [{ id: "g", label: "G" }, { id: "h", label: "H" }] }, { x: "g", y: "nope" }],
    ["matching", { prompt: "m", left: [{ id: "a", label: "A" }, { id: "b", label: "B" }], right: [{ id: "x", label: "X" }, { id: "y", label: "Y" }] }, { a: "x", b: "x" }],
    ["allocate", { prompt: "a", mode: "allocation", total: 5, exact: true, controls: [{ id: "p", label: "P", max: 5 }, { id: "q", label: "Q", max: 5 }] }, { p: 1, q: 1 }],
    ["allocate", { prompt: "a", mode: "allocation", total: 5, controls: [{ id: "p", label: "P", max: 5 }, { id: "q", label: "Q", max: 5 }] }, { p: 5, q: 5 }],
    ["allocate", { prompt: "a", controls: [{ id: "p", label: "P", max: 5, step: 1 }] }, { p: 2.5 }],
    ["hotspot", { prompt: "h", image: { src: "/x.svg", alt: "x" }, regions: [{ id: "r", label: "R", x: 0, y: 0, w: 10, h: 10 }] }, ["r", "s"]],
    ["map", { prompt: "m", nodes: [{ id: "a", label: "A", x: 0, y: 0 }, { id: "b", label: "B", x: 1, y: 1 }, { id: "c", label: "C", x: 2, y: 2 }], edges: [["a", "b"], ["b", "c"]], start: "a", end: "c" }, ["a", "c"]],
    ["pattern_grid", { prompt: "p", rows: 1, cols: 2, palette: [{ id: "o", label: "O" }], given: ["o", ""] }, ["", "o"]],
    ["sketch", { prompt: "s" }, { strokes: [[1, 2, 3]] }],
    ["sketch", { prompt: "s" }, { strokes: [[5000, 0]] }],
  ];
  it.each(cases)("%s rejects %j", (type, config, value) => {
    const r = submit(model(type, config), value);
    expect(r.ok).toBe(false);
  });
});

describe("open-ended input is recorded without judging", () => {
  it("arrange with no outcomes accepts any complete order", () => {
    const m = model("arrange", { prompt: "a", items: [{ id: "x", label: "X" }, { id: "y", label: "Y" }] });
    const r = submit(m, ["y", "x"]);
    expect(r.ok && r.nextScreenKey).toBe("end");
    expect(r.ok && r.state.outcomes).toEqual({});
  });

  it("a sketch is not kept unless the mission says so (Brief §46)", () => {
    const r = submit(model("sketch", { prompt: "s" }), { strokes: [[1, 2, 3, 4]] });
    expect(r.ok && r.response?.value).toBe("drawn");
    const kept = submit(model("sketch", { prompt: "s", store: true }), { strokes: [[1, 2, 3, 4]] });
    expect(kept.ok && kept.response?.value).toEqual({ strokes: [[1, 2, 3, 4]] });
  });

  it("matching grades pairs when outcomes are set", () => {
    const m = model("matching", {
      prompt: "m",
      left: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
      right: [{ id: "x", label: "X" }, { id: "y", label: "Y" }],
      outcomes: [{ id: "all", match: { pairs: { a: "x", b: "y" } }, next: "other" }],
    });
    expect(submit(m, { a: "y", b: "x" }).ok).toBe(false);
    const r = submit(m, { a: "x", b: "y" });
    expect(r.ok && r.nextScreenKey).toBe("other");
  });
});

describe("variables, inventory and allocation", () => {
  const decl = [{ key: "pack", type: "list", visibility: "visible", default: [] }, { key: "north", type: "number", visibility: "hidden", default: 0 }];

  it("inventory stores the selection and offers it back later", () => {
    const m = model("inventory", { prompt: "i", items: [{ id: "rope", label: "Rope" }, { id: "torch", label: "Torch" }, { id: "key", label: "Key", when: { ref: { unlocked: "gate" }, op: "exists" } }], storeAs: "pack", max: 2 }, { variables: decl });
    expect(submit(m, ["key"]).ok).toBe(false); // gated item is not available yet
    const r = submit(m, ["rope"]);
    expect(r.ok && r.state.variables.pack).toEqual(["rope"]);
    const page = projectScreen(m, m.screens[0], r.ok ? r.state : S(), now);
    const cfg = page.configuration as { items: { id: string }[]; carried: string[] };
    expect(cfg.items.map((i) => i.id)).toEqual(["rope", "torch"]);
    expect(cfg.carried).toEqual(["rope"]);
    expect(JSON.stringify(page)).not.toContain("storeAs");
  });

  it("allocation controls set their variables on the server", () => {
    const m = model("allocate", { prompt: "a", mode: "allocation", total: 4, exact: true, controls: [{ id: "n", label: "N", max: 4, storeAs: "north" }, { id: "s", label: "S", max: 4 }] }, { variables: decl });
    const r = submit(m, { n: 3, s: 1 });
    expect(r.ok && r.state.variables.north).toBe(3);
    expect(clientState(m, r.ok ? r.state : S()).variables.north).toBeUndefined(); // hidden stays hidden
  });
});

describe("simulation", () => {
  const m = model(
    "simulation",
    {
      prompt: "s",
      controls: [{ id: "h", label: "H", min: 1, max: 5, storeAs: "height" }],
      readouts: [{ when: { ref: { var: "height" }, op: "gte", value: 4 }, text: "It flies." }, { when: { always: true }, text: "It rolls." }],
      minRuns: 1,
    },
    { variables: [{ key: "height", type: "number", visibility: "hidden", default: 1 }] },
  );

  it("cannot continue before a run", () => {
    expect(submit(m, { action: "done" }).ok).toBe(false);
  });

  it("a run stays on the screen and the server decides the readout", () => {
    const r = submit(m, { action: "run", values: { h: 5 } });
    expect(r.ok && r.stayed).toBe(true);
    const page = projectScreen(m, m.screens[0], r.ok ? r.state : S(), now);
    const cur = (page.configuration as { current: { runs: number; readouts: string[] } }).current;
    expect(cur.runs).toBe(1);
    expect(cur.readouts).toEqual(["It flies.", "It rolls."]);
    // the model behind the readouts never reaches the page
    expect(JSON.stringify(page)).not.toContain("gte");
    expect(JSON.stringify(page)).not.toContain("height");
    const done = submit(m, { action: "done" }, r.ok ? r.state : S());
    expect(done.ok && done.nextScreenKey).toBe("end");
  });
});

describe("the persistent workspace", () => {
  const def = {
    workspaces: [{
      key: "board", label: "Evidence board", links: true,
      zones: [{ id: "sure", label: "Sure" }, { id: "unsure", label: "Unsure" }],
      objects: [{ id: "note", label: "The note" }, { id: "photo", label: "The photo", when: { ref: { unlocked: "photo" }, op: "exists" } }],
    }],
  };
  const m = buildModel({
    definition: { ...def, completion: { ref: { visited: "end" }, op: "exists" } },
    screens: [
      screen("lib", "workspace", { prompt: "Arrange", workspace: "board", next: "later" }, 1),
      screen("later", "workspace", { prompt: "Look again", workspace: "board", next: "end" }, 2),
      screen("end", "content", { next: "done" }, 3),
      screen("done", "completion", { message: "Done" }, 4),
    ],
    completionRule: null,
  });

  it("refuses an object that has not appeared yet", () => {
    expect(submit(m, { placements: { photo: "sure" } }).ok).toBe(false);
  });

  it("keeps the arrangement under the board's key, across screens", () => {
    const r = submit(m, { placements: { note: "sure" }, links: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.workspaces.board).toEqual({ placements: { note: "sure" }, links: [] });
    expect(evaluate({ ref: { placed: "board.note" }, op: "eq", value: "sure" }, { state: r.state, now })).toBe(true);
    const later = projectScreen(m, m.screens[1], { ...r.state, unlocked: ["photo"] }, now);
    const board = (later.configuration as { board: { saved: unknown; objects: { id: string }[] } }).board;
    expect(board.saved).toEqual({ placements: { note: "sure" }, links: [] });
    expect(board.objects.map((o) => o.id)).toEqual(["note", "photo"]); // new object arrives
    const revised = step(m, { ...r.state, unlocked: ["photo"] }, "later", { kind: "submit", screenKey: "later", value: { placements: { note: "unsure", photo: "sure" }, links: [["note", "photo"]] } }, now);
    expect(revised.ok && revised.state.workspaces.board).toEqual({ placements: { note: "unsure", photo: "sure" }, links: [["note", "photo"]] });
  });
});

describe("authoring checks for the library", () => {
  const codes = (m: MissionModel) => validateMission(m).issues.map((i) => i.code);

  it("an answer naming an item the screen does not have", () => {
    expect(codes(model("arrange", { prompt: "a", items: [{ id: "x", label: "X" }, { id: "y", label: "Y" }], outcomes: [{ id: "o", match: { order: ["x", "q"] } }] }))).toContain("unknown_answer_item");
  });
  it("storing into an undeclared variable", () => {
    expect(codes(model("numeric_entry", { prompt: "n", storeAs: "nowhere" }))).toContain("undeclared_variable");
  });
  it("a workspace screen for a board that does not exist", () => {
    expect(codes(model("workspace", { prompt: "w", workspace: "ghost" }))).toContain("unknown_workspace");
  });
  it("an outcome leading nowhere, and no recovery route", () => {
    const c = codes(model("code_entry", { prompt: "c", outcomes: [{ id: "o", match: { values: ["x"] }, next: "ghost" }] }));
    expect(c).toContain("broken_reference");
    expect(c).toContain("no_recovery_route");
  });
  it("reading the outcome of a screen that has none", () => {
    const m = model("content", { routes: [{ when: { ref: { outcome: "other" }, op: "eq", value: "x" }, to: "end" }] });
    expect(codes(m)).toContain("outcome_without_grading");
  });
  it("a board step that requires pieces is still playable in QA (found in browser QA)", () => {
    const m = model("workspace", { prompt: "w", workspace: "board", requirePlaced: ["a"] }, {
      workspaces: [{ key: "board", label: "B", zones: [{ id: "z", label: "Z" }], objects: [{ id: "a", label: "A" }, { id: "b", label: "B", when: { ref: { unlocked: "never" }, op: "exists" } }] }],
      unlocks: [{ key: "never", when: { ref: { visited: "done" }, op: "exists" } }],
    });
    const { issues, paths } = validateMission(m);
    expect(blocking(issues).filter((i) => i.screenKey === "lib")).toEqual([]);
    expect(paths.some((p) => p.outcome === "complete")).toBe(true);
  });

  it("an image without a text alternative", () => {
    expect(codes(model("hotspot", { prompt: "h", image: { src: "/x.svg", alt: " " }, regions: [{ id: "r", label: "R", x: 0, y: 0, w: 5, h: 5 }] }))).toContain("missing_alt_text");
  });
});
