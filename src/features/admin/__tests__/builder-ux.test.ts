import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describePath } from "@/features/mission-engine/field-labels";
import { friendlyFirstIssue, friendlyIssue } from "@/features/mission-engine/issue-text";
import { buildModel } from "@/features/mission-engine/definition";
import { validateMission } from "@/features/mission-engine/validator";
import { completionRule } from "@/features/mission-engine/schemas";
import { completionCondition } from "@/features/mission-engine/runtime";
import { fromLegacyCompletion } from "@/features/mission-engine/conditions";
import { basicRuleScreen, describeCondition, effectiveCompletion } from "@/features/admin/completion-text";
import { inProgressOn, missionStatusLines, publishImpact } from "@/features/admin/mission-status";
import { SCREEN_KEY_RULE, suggestScreenKey } from "@/features/admin/screen-key";
import { readinessChecks, sectionOf, sectionStatuses, type BuilderFacts } from "@/features/admin/builder-readiness";

/*
 * Behavioural tests for the Mission Builder usability work (D-115..D-122).
 * Everything here is pure logic, exercised with real inputs — not source text.
 */

describe("validation messages name fields as the form does", () => {
  it("turns a schema path into the author's labels", () => {
    expect(describePath(["options", 0, "next"])).toBe("Option 1 → Goes to");
    expect(describePath(["variables", 2, "key"])).toBe("Variable 3 → Key");
    expect(describePath(["routes", 1, "to"])).toBe("Route 2 → Goes to");
    expect(describePath([])).toBe("");
  });

  it("explains a missing destination without exposing the path", () => {
    const schema = z.object({ options: z.array(z.object({ id: z.string(), next: z.string().min(1) })) });
    const r = schema.safeParse({ options: [{ id: "a" }] });
    expect(r.success).toBe(false);
    const msg = friendlyFirstIssue(r.error!.issues);
    expect(msg).toBe("Option 1 → Goes to needs a destination screen.");
    expect(msg).not.toMatch(/options\.0|Invalid input|received undefined/);
  });

  it("explains an empty name, a number out of range and an unknown setting", () => {
    expect(friendlyIssue({ code: "too_small", origin: "string", minimum: 1, path: ["variables", 0, "key"] })).toBe("Variable 1 → Key needs a name.");
    expect(friendlyIssue({ code: "too_small", origin: "number", minimum: 0, inclusive: false, path: ["timer", "seconds"] })).toBe("Timed stage → Seconds must be more than 0.");
    expect(friendlyIssue({ code: "unrecognized_keys", keys: ["colour"], path: [] })).toMatch(/doesn't recognise: colour/);
  });

  it("keeps the schema's own prose for custom refinements", () => {
    expect(friendlyIssue({ code: "custom", message: "Pick two different options.", path: [] })).toBe("Pick two different options.");
  });

  it("the validator reports an invalid screen in those words, and still blocks", () => {
    const model = buildModel({
      definition: {},
      screens: [
        { screenKey: "pick", type: "choice", title: "Pick a path", body: null, sequence: 10, configuration: { prompt: "Which way?", options: [{ id: "a", label: "Left" }, { id: "b", label: "Right", next: "end" }] } },
        { screenKey: "end", type: "completion", title: "Done", body: null, sequence: 20, configuration: { message: "Done", trailEntries: [] } },
      ],
      completionRule: { type: "screen_reached", screenKey: "end" },
    });
    const { issues } = validateMission(model, {});
    // Whichever check catches it, the missing destination is blocking.
    expect(issues.some((i) => i.screenKey === "pick" && i.severity === "blocking")).toBe(true);
    expect(issues.every((i) => !/options\.\d/.test(i.detail))).toBe(true);
  });

  it("an invalid screen configuration is blocking and worded for an author", () => {
    const model = buildModel({
      definition: {},
      screens: [
        { screenKey: "pick", type: "choice", title: "Pick a path", body: null, sequence: 10, configuration: { prompt: "Which way?", options: [] } },
        { screenKey: "end", type: "completion", title: "Done", body: null, sequence: 20, configuration: { message: "Done", trailEntries: [] } },
      ],
      completionRule: { type: "screen_reached", screenKey: "end" },
    });
    const invalid = validateMission(model, {}).issues.find((i) => i.code === "invalid_config");
    expect(invalid?.severity).toBe("blocking");
    expect(invalid?.detail).toMatch(/^Options: add at least \d+\.$/);
  });

  it("a broken reference says which kind of link, in builder words", () => {
    const model = buildModel({
      definition: {},
      screens: [
        { screenKey: "intro", type: "content", title: "Intro", body: null, sequence: 10, configuration: { next: "nowhere" } },
        { screenKey: "end", type: "completion", title: "Done", body: null, sequence: 20, configuration: { message: "Done", trailEntries: [] } },
      ],
      completionRule: { type: "screen_reached", screenKey: "end" },
    });
    const broken = validateMission(model, {}).issues.find((i) => i.code === "broken_reference");
    expect(broken?.detail).toBe("Its “Goes to” goes to \"nowhere\", which is not a screen in this version.");
  });
});

describe("completion: the rule in force is always stated, nothing is rewritten (D-115)", () => {
  const titles = new Map([["end", "The end"], ["q", "Your answer"]]);

  it("the basic rule is recognised and described", () => {
    const rule = { type: "screen_reached", screenKey: "end" };
    expect(basicRuleScreen(rule)).toBe("end");
    const e = effectiveCompletion({ rule, definitionCompletion: undefined, titles });
    expect(e.source).toBe("rule");
    expect(e.inEffect).toBe("Complete when the child reaches “The end”.");
  });

  it("a custom rule is not treated as basic, and is described faithfully", () => {
    const rule = { type: "conditions", conditions: [{ kind: "response_exists", screenKey: "q" }, { kind: "screen_visited", screenKey: "end" }] };
    expect(completionRule.safeParse(rule).success).toBe(true);
    expect(basicRuleScreen(rule)).toBeNull();
    expect(effectiveCompletion({ rule, definitionCompletion: undefined, titles }).inEffect)
      .toBe("Complete when all of: the child answers “Your answer”; the child reaches “The end”.");
  });

  it("the mission-logic condition overrides the rule, and the panel says so", () => {
    const e = effectiveCompletion({
      rule: { type: "screen_reached", screenKey: "end" },
      definitionCompletion: { ref: { response: "q" }, op: "exists" },
      titles,
    });
    expect(e.source).toBe("definition");
    expect(e.inEffect).toMatch(/^Complete when the child answers “Your answer” — set by the completion condition in Mission logic\.$/);
    // The rule is still described — kept, not discarded.
    expect(e.ruleText).toBe("the child reaches “The end”");
  });

  it("no rule at all is reported as such", () => {
    expect(effectiveCompletion({ rule: null, definitionCompletion: undefined }).source).toBe("none");
  });

  it("describes the shared condition language without inventing meaning", () => {
    expect(describeCondition({ always: true })).toBe("straight away");
    expect(describeCondition({ not: { always: true } })).toBe("never");
    expect(describeCondition({ ref: { var: "fuel" }, op: "gte", value: 3 })).toBe("variable “fuel” ≥ 3");
    expect(describeCondition({ weird: 1 })).toBe("a custom condition");
  });
});

describe("the stated completion source matches the RUNTIME's precedence", () => {
  const screens = [{ screenKey: "end", type: "completion" as const, title: "End", body: null, sequence: 10, configuration: { message: "x", trailEntries: [] } }];
  const rule = { type: "screen_reached", screenKey: "end" };
  const cond = { ref: { response: "q" }, op: "exists" };
  const cases: [string, unknown, unknown][] = [
    ["rule only", rule, {}],
    ["definition only", null, { completion: cond }],
    ["both: definition wins", rule, { completion: cond }],
    ["custom rule only", { type: "conditions", conditions: [{ kind: "choice_exists", screenKey: "end" }] }, {}],
    ["neither", null, {}],
  ];
  for (const [name, r, definition] of cases) {
    it(name, () => {
      const model = buildModel({ definition, screens, completionRule: r });
      const used = completionCondition(model);
      const stated = effectiveCompletion({ rule: r, definitionCompletion: model.definition.completion });
      if (stated.source === "definition") expect(used).toEqual(model.definition.completion);
      else if (stated.source === "rule") expect(used).toEqual(fromLegacyCompletion(r));
      else expect(used).toBeNull();
    });
  }
});

describe("live version and catalogue are reported separately, from real data", () => {
  const versions = [{ version: 3, status: "draft" }, { version: 2, status: "published" }, { version: 1, status: "archived" }];
  const usage = [{ version: 2, runs: 6, complete: 2 }, { version: 1, runs: 3, complete: 2 }];

  it("states the live version and catalogue visibility as two facts", () => {
    const lines = missionStatusLines({ versions, catalogueVisible: false, isFree: false, priceMinor: 1200, editing: versions[0] });
    expect(lines[0]).toBe("Version 2 is live for learners.");
    expect(lines[1]).toBe("The mission is hidden from the catalogue.");
    expect(lines[2]).toMatch(/version 3 \(draft\)\. Changes here affect nobody until it is published\./);
  });

  it("never claims a missing price is purchasable", () => {
    const lines = missionStatusLines({ versions, catalogueVisible: true, isFree: false, priceMinor: null });
    expect(lines[1]).toBe("The mission is shown in the catalogue, but it has no price set.");
  });

  it("with nothing published, says so", () => {
    expect(missionStatusLines({ versions: [{ version: 1, status: "draft" }], catalogueVisible: false, isFree: false, priceMinor: null })[0])
      .toBe("No version is live for learners yet.");
  });

  it("the publish confirmation uses the real in-progress counts", () => {
    expect(inProgressOn(usage, 2)).toBe(4);
    const lines = publishImpact({ version: 3, versions, usage, catalogueVisible: true });
    expect(lines).toEqual([
      "New learners who start this mission will get version 3.",
      "Version 2 stops being offered to new learners and is archived, not deleted. 4 learners partway through version 2 will stay on it.",
      "1 learner on version 1 also stays on it.",
      "Publishing doesn't change whether the mission is shown in the catalogue. It is currently shown — change that in the mission details.",
    ]);
  });

  it("first publication mentions no previous version", () => {
    const lines = publishImpact({ version: 1, versions: [{ version: 1, status: "draft" }], usage: [], catalogueVisible: false });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("New learners who start this mission will get version 1.");
  });
});

describe("suggested screen keys (D-117)", () => {
  it("follows the server's key rule", () => {
    for (const t of ["The List!", "  Pick a path ", "Été — à la plage", "123 go", "!!!"]) {
      expect(suggestScreenKey(t, [])).toMatch(SCREEN_KEY_RULE);
    }
    expect(suggestScreenKey("The List!", [])).toBe("the_list");
    expect(suggestScreenKey("!!!", [])).toBe("screen");
  });

  it("never suggests a key already in use", () => {
    expect(suggestScreenKey("Intro", ["intro"])).toBe("intro_2");
    expect(suggestScreenKey("Intro", ["intro", "intro_2"])).toBe("intro_3");
  });
});

describe("readiness is advisory and honest (D-116)", () => {
  const base: BuilderFacts = {
    issues: [],
    screenCount: 3,
    resourceCount: 1,
    hasParentNote: true,
    hasCompletion: true,
    logicInUse: 0,
    mediaCount: 0,
    details: { description: "A mission", coverImage: "/x.jpg", priceMinor: 1200, isFree: false },
    paths: { total: 2, complete: 2 },
  };

  it("maps issues to the section they are fixed in", () => {
    expect(sectionOf({ code: "dead_end", blocking: true, screen_key: "a", detail: "" })).toBe("screens");
    expect(sectionOf({ code: "no_completion_rule", blocking: true, screen_key: null, detail: "" })).toBe("completion");
    expect(sectionOf({ code: "no_parent_note", blocking: true, screen_key: null, detail: "" })).toBe("kit");
    expect(sectionOf({ code: "missing_alt_text", blocking: true, screen_key: "a", detail: "" })).toBe("media");
    expect(sectionOf({ code: "duplicate_variable", blocking: true, screen_key: null, detail: "", category: "logic" })).toBe("logic");
  });

  it("a section with a blocking issue is never reported as fine", () => {
    const st = sectionStatuses({ ...base, issues: [{ code: "dead_end", blocking: true, screen_key: "a", detail: "x" }] });
    expect(st.screens).toEqual({ kind: "needs_attention", text: "Needs attention (1)" });
    expect(st.review.kind).toBe("needs_attention");
    expect(st.review.text).toBe("1 problem to fix before publishing");
  });

  it("only says 'No problems found' when the checks found none, and marks unused options as optional", () => {
    const st = sectionStatuses(base);
    expect(st.screens.text).toBe("No problems found");
    expect(st.logic).toEqual({ kind: "optional", text: "Optional · not used" });
    expect(st.review.text).toBe("No blocking problems found");
  });

  it("an empty draft is 'Not started', not 'No problems found'", () => {
    const st = sectionStatuses({ ...base, screenCount: 0, hasCompletion: false, resourceCount: 0, hasParentNote: false });
    expect(st.screens.kind).toBe("not_started");
    expect(st.completion.kind).toBe("not_started");
    expect(st.kit.kind).toBe("not_started");
    expect(st.review.kind).toBe("not_started");
  });

  it("missing catalogue details are recommendations, never required", () => {
    const checks = readinessChecks({ ...base, details: { description: null, coverImage: null, priceMinor: null, isFree: false } });
    const details = checks.filter((c) => c.section === "details");
    expect(details).toHaveLength(3);
    expect(details.every((c) => c.level === "recommended")).toBe(true);
  });

  it("required items (blocking issues) come first", () => {
    const checks = readinessChecks({
      ...base,
      details: { description: null, coverImage: "/x", priceMinor: 1, isFree: false },
      issues: [{ code: "no_parent_note", blocking: true, screen_key: null, detail: "No note." }],
    });
    expect(checks[0]).toMatchObject({ level: "required", section: "kit", text: "No note." });
    expect(checks[0].why).toBe("Write the note in For Parents. An attached PDF alone doesn't count.");
  });

  it("reports incomplete branch-test routes once, not twice", () => {
    const facts = { ...base, paths: { total: 3, complete: 2 } };
    expect(readinessChecks(facts).filter((c) => c.section === "review")).toHaveLength(1);
    const withIssue = { ...facts, issues: [{ code: "cannot_reach_complete", blocking: true, screen_key: null, detail: "x" }] };
    expect(readinessChecks(withIssue).filter((c) => c.section === "review")).toHaveLength(0);
  });
});
