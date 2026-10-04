import { describe, expect, it } from "vitest";
import { buildModel } from "../definition";
import { missionDefinition } from "../definition";
import { screenConfigByType, type ScreenType } from "../schemas";
import { blocking, validateMission } from "../validator";
import { missionPatterns, thinkingPrompts } from "../patterns";

/*
 * Every pattern is a working structure as inserted: its screens parse, QA
 * finds nothing structural to block, and some route plays to the end.
 */

function asMission(id: string) {
  const pat = missionPatterns.find((p) => p.id === id)!;
  const built = pat.build("p1_");
  const screens = built.screens.map((s, i) => ({
    screenKey: s.key, type: s.type as ScreenType, title: s.title, body: s.body, sequence: (i + 1) * 10,
    // the author connects the last screen onward; here, to an ending
    configuration: i === built.screens.length - 1 ? { ...s.configuration, next: "end" } : s.configuration,
  }));
  screens.push({ screenKey: "end", type: "completion" as ScreenType, title: "Done", body: null, sequence: 999, configuration: { message: "Done" } });
  const definition = { ...built.definition, completion: { ref: { visited: screens[screens.length - 2].screenKey }, op: "exists" } };
  return { model: buildModel({ definition, screens, completionRule: null }), built, definition };
}

describe("mission patterns", () => {
  it("there are the eight the plan names", () => {
    expect(missionPatterns.map((p) => p.name)).toEqual([
      "Choose → consequence → reconsider",
      "Predict → test → reveal → adjust",
      "Clue → decode → unlock → investigate",
      "Plan → changed condition → reroute",
      "Build → test → change → retest",
      "Observe → evidence → explanation → new evidence → revise",
      "Allocate → event → rebalance",
      "Original → challenge → revised",
    ]);
  });

  it.each(missionPatterns.map((p) => p.id))("%s parses, passes QA and plays to the end", (id) => {
    const { model, built, definition } = asMission(id);
    for (const s of built.screens) {
      const r = screenConfigByType[s.type as ScreenType].safeParse(s.configuration);
      expect(r.success, `${id}/${s.key}: ${!r.success && r.error.issues[0]?.message}`).toBe(true);
    }
    expect(missionDefinition.safeParse(definition).success).toBe(true);
    const { issues, paths } = validateMission(model);
    expect(blocking(issues), JSON.stringify(blocking(issues))).toEqual([]);
    expect(paths.some((p) => p.outcome === "complete")).toBe(true);
  });

  it("every key carries the prefix, so a pattern can sit beside existing screens", () => {
    for (const p of missionPatterns) {
      const { screens, definition } = p.build("x9_");
      expect(screens.every((s) => s.key.startsWith("x9_"))).toBe(true);
      for (const v of definition.variables ?? []) expect(String(v.key).startsWith("x9_")).toBe(true);
    }
  });
});

describe("thinking prompts", () => {
  it("cover the plan's fourteen and each parses", () => {
    expect(thinkingPrompts).toHaveLength(14);
    for (const t of thinkingPrompts) expect(screenConfigByType[t.type].safeParse(t.configuration).success, t.id).toBe(true);
  });
});
