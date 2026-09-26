import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyInteraction,
  emptyMissionState,
  isMissionComplete,
  parseScreenConfig,
  resolveNextScreen,
  type CompletionRule,
  type MissionInteraction,
  type MissionScreen,
  type MissionStateData,
} from "../index";

/**
 * SIX NAMES — Build Brief v0.2 conformance.
 *
 * Drives the REAL reducer and REAL navigation over the screen graph as seeded.
 * The graph below mirrors supabase/seed/six_names_screens.sql; a guard at the
 * end asserts the seed still declares every screen it references.
 */

const repo = join(__dirname, "../../../..");
const seed = readFileSync(
  join(repo, "supabase/seed/six_names_screens.sql"),
  "utf8",
);
const access = readFileSync(
  join(repo, "supabase/migrations/0007_screen_access.sql"),
  "utf8",
);
const persistence = readFileSync(
  join(repo, "src/features/mission-engine/persistence.ts"),
  "utf8",
);

const screen = (
  key: string,
  type: MissionScreen["type"],
  sequence: number,
  configuration: unknown = {},
): MissionScreen => ({
  screenKey: key,
  type,
  title: null,
  body: null,
  sequence,
  configuration,
});

const CONCERNS = [
  { id: "stop_unfair_claim", label: "Stop an unfair claim" },
  { id: "find_out_meaning", label: "Find out what the list means" },
  { id: "protect_project", label: "Protect the project" },
  { id: "avoid_growing_rumour", label: "Avoid making the rumour bigger" },
];

const TRACKER_DIMENSIONS = [
  {
    id: "spread",
    label: "Spread",
    positions: ["Few", "Groups", "Nearly everyone"],
  },
  {
    id: "support",
    label: "Support",
    positions: ["Alone", "Some support", "Clearly supported"],
  },
  {
    id: "clarity",
    label: "Clarity",
    positions: ["Guesswork", "Some facts", "Purpose clear"],
  },
];

const graph: MissionScreen[] = [
  screen("mission_brief", "content", 10),
  screen("prepare", "prepare", 20, {
    materials: ["Board"],
    readyLabel: "I'm ready",
  }),
  screen("zone1_list", "content", 30),
  screen("decision1_concerns", "multi_choice", 40, {
    prompt: "Choose TWO Concern cards.",
    options: CONCERNS,
    selectExactly: 2,
  }),
  screen("decision1_move", "choice", 50, {
    prompt: "What do you do first?",
    options: [
      { id: "a", label: "Pause the claim", next: "consequence1_a" },
      { id: "b", label: "Find the meaning first", next: "consequence1_b" },
      { id: "c", label: "Protect the project first", next: "consequence1_c" },
    ],
  }),
  screen("consequence1_a", "content", 60, { next: "tracker1" }),
  screen("consequence1_b", "content", 61, { next: "tracker1" }),
  screen("consequence1_c", "content", 62, { next: "tracker1" }),
  screen("tracker1", "tracker", 70, {
    prompt: "Where would you place them now?",
    dimensions: TRACKER_DIMENSIONS,
    next: "list_changes",
  }),
  screen("list_changes", "content", 80),
  screen("decision2_concerns", "multi_choice", 90, {
    prompt: "Choose TWO Concern cards.",
    options: CONCERNS,
    selectExactly: 2,
  }),
  screen("decision2_move", "choice", 100, {
    prompt: "What should happen next?",
    options: [
      { id: "a", label: "Correct the claim", next: "consequence2_a" },
      { id: "b", label: "Check the project evidence", next: "consequence2_b" },
      { id: "c", label: "Leave the claim aside", next: "consequence2_c" },
    ],
  }),
  screen("consequence2_a", "content", 110, { next: "tracker2" }),
  screen("consequence2_b", "content", 111, { next: "tracker2" }),
  screen("consequence2_c", "content", 112, { next: "tracker2" }),
  screen("tracker2", "tracker", 120, {
    prompt: "Place them where they belong now.",
    dimensions: TRACKER_DIMENSIONS,
    next: "later_evidence",
  }),
  screen("later_evidence", "content", 130),
  screen("judgement_card", "choice", 140, {
    prompt: "Which Judgement card?",
    options: [
      { id: "stand_by_both", label: "I stand by both decisions" },
      { id: "reconsider_1", label: "I would reconsider Decision 1" },
      { id: "reconsider_2", label: "I would reconsider Decision 2" },
    ],
  }),
  screen("judgement_reflection", "response", 150, { prompt: "Why?" }),
  screen("final_judgement", "response", 160, {
    prompt: "Write your final judgement.",
    promptLines: [
      "The evidence changed…",
      "It could not undo…",
      "What I stand by now is…",
    ],
  }),
  screen("complete", "completion", 170, { message: "Done." }),
];

const byKey = (key: string) => graph.find((s) => s.screenKey === key)!;

function nextBySequence(currentKey: string): string | null {
  const ordered = [...graph].sort((a, b) => a.sequence - b.sequence);
  const i = ordered.findIndex((s) => s.screenKey === currentKey);
  return ordered[i + 1]?.screenKey ?? null;
}

const RULE: CompletionRule = {
  type: "conditions",
  conditions: [
    { kind: "choice_exists", screenKey: "decision1_move" },
    { kind: "choice_exists", screenKey: "decision2_move" },
    { kind: "screen_visited", screenKey: "later_evidence" },
    { kind: "choice_exists", screenKey: "judgement_card" },
    { kind: "response_exists", screenKey: "final_judgement" },
  ],
};

/** Walk the mission the way the engine does: reduce, then resolve. */
function play(interactions: MissionInteraction[]) {
  let state: MissionStateData = emptyMissionState;
  let position = "mission_brief";
  const visited: string[] = [position];

  for (const interaction of interactions) {
    state = applyInteraction(state, interaction);
    if (interaction.kind !== "custom") {
      const current = byKey(interaction.screenKey);
      position =
        resolveNextScreen(current, nextBySequence(current.screenKey), state) ??
        position;
      visited.push(position);
    }
  }
  return { state, position, visited };
}

const upToDecision1: MissionInteraction[] = [
  { kind: "visit", screenKey: "mission_brief" },
  { kind: "handoff", screenKey: "prepare" },
  { kind: "visit", screenKey: "zone1_list" },
  {
    kind: "multi_choice",
    screenKey: "decision1_concerns",
    optionIds: ["stop_unfair_claim", "find_out_meaning"],
  },
];

// ══════════════════════════════════════════════════════ branching ══════════
describe("decisions determine the consequence", () => {
  it.each([
    ["a", "consequence1_a"],
    ["b", "consequence1_b"],
    ["c", "consequence1_c"],
  ])("first move %s leads to %s", (option, expected) => {
    const { position } = play([
      ...upToDecision1,
      { kind: "choice", screenKey: "decision1_move", optionId: option },
    ]);
    expect(position).toBe(expected);
  });

  it.each([
    ["a", "consequence2_a"],
    ["b", "consequence2_b"],
    ["c", "consequence2_c"],
  ])("second move %s leads to %s", (option, expected) => {
    const { position } = play([
      { kind: "choice", screenKey: "decision2_move", optionId: option },
    ]);
    expect(position).toBe(expected);
  });

  it("all three first-move branches reconverge on the tracker", () => {
    for (const key of ["consequence1_a", "consequence1_b", "consequence1_c"]) {
      const s = byKey(key);
      expect(resolveNextScreen(s, nextBySequence(key), emptyMissionState)).toBe(
        "tracker1",
      );
    }
  });

  it("neither branch is marked correct or incorrect", () => {
    // Brief §10. No option carries a score, weight or correctness flag.
    for (const key of ["decision1_move", "decision2_move", "judgement_card"]) {
      const config = parseScreenConfig("choice", byKey(key).configuration);
      for (const option of config.options) {
        expect(Object.keys(option).sort()).toEqual(
          key === "judgement_card" ? ["id", "label"] : ["id", "label", "next"],
        );
      }
    }
  });
});

// ═══════════════════════════════════════════════════ Concern cards (Q2) ════
describe("Concern cards are recorded, not branching", () => {
  it("records exactly two selections per decision", () => {
    const { state } = play(upToDecision1);
    expect(state.multiChoices.decision1_concerns).toEqual([
      "stop_unfair_claim",
      "find_out_meaning",
    ]);
  });

  it("no Concern option carries a branch target", () => {
    // Q2: the MOVE determines the consequence. Concerns capture what matters.
    for (const key of ["decision1_concerns", "decision2_concerns"]) {
      const config = parseScreenConfig(
        "multi_choice",
        byKey(key).configuration,
      );
      for (const option of config.options) {
        expect(option).not.toHaveProperty("next");
      }
    }
  });

  it("the consequence is unaffected by which concerns were chosen", () => {
    const withConcerns = play([
      ...upToDecision1,
      { kind: "choice", screenKey: "decision1_move", optionId: "b" },
    ]);
    const withOthers = play([
      {
        kind: "multi_choice",
        screenKey: "decision1_concerns",
        optionIds: ["protect_project", "avoid_growing_rumour"],
      },
      { kind: "choice", screenKey: "decision1_move", optionId: "b" },
    ]);
    expect(withConcerns.position).toBe(withOthers.position);
  });

  it("Decision 2 may repeat or differ from Decision 1", () => {
    const { state } = play([
      {
        kind: "multi_choice",
        screenKey: "decision1_concerns",
        optionIds: ["stop_unfair_claim", "protect_project"],
      },
      {
        kind: "multi_choice",
        screenKey: "decision2_concerns",
        optionIds: ["stop_unfair_claim", "protect_project"],
      },
    ]);
    expect(state.multiChoices.decision2_concerns).toEqual(
      state.multiChoices.decision1_concerns,
    );

    const differing = play([
      {
        kind: "multi_choice",
        screenKey: "decision1_concerns",
        optionIds: ["stop_unfair_claim", "protect_project"],
      },
      {
        kind: "multi_choice",
        screenKey: "decision2_concerns",
        optionIds: ["find_out_meaning", "avoid_growing_rumour"],
      },
    ]);
    expect(differing.state.multiChoices.decision1_concerns).toEqual([
      "stop_unfair_claim",
      "protect_project",
    ]);
    expect(differing.state.multiChoices.decision2_concerns).toEqual([
      "find_out_meaning",
      "avoid_growing_rumour",
    ]);
  });

  it("the seed asks for exactly two at both decisions", () => {
    expect(seed.match(/'selectExactly', 2/g)).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════ tracker ═════════
describe("tracker is reflection, not a score", () => {
  it("persists all three dimensions", () => {
    const { state } = play([
      {
        kind: "tracker",
        screenKey: "tracker1",
        positions: { spread: 1, support: 0, clarity: 2 },
      },
    ]);
    expect(state.custom.tracker1).toEqual({
      spread: 1,
      support: 0,
      clarity: 2,
    });
  });

  it("keeps both trackers independently", () => {
    const { state } = play([
      {
        kind: "tracker",
        screenKey: "tracker1",
        positions: { spread: 0, support: 0, clarity: 0 },
      },
      {
        kind: "tracker",
        screenKey: "tracker2",
        positions: { spread: 2, support: 2, clarity: 2 },
      },
    ]);
    expect(state.custom.tracker1).not.toEqual(state.custom.tracker2);
  });

  it("positions are labelled, never numeric scores", () => {
    const config = parseScreenConfig(
      "tracker",
      byKey("tracker1").configuration,
    );
    for (const dimension of config.dimensions) {
      expect(dimension.positions).toHaveLength(3);
      for (const label of dimension.positions) {
        expect(label).not.toMatch(/^\d+$/);
      }
    }
  });

  it("nothing aggregates, scores or ranks tracker values", () => {
    // Look at executable code, not prose — "entry point" is not a score.
    const code = persistence
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const forbidden of [
      /\bscore\b/i,
      /\btotalScore\b/i,
      /\bpointsAwarded\b/i,
      /\brankings?\b/i,
      /\bpercentComplete\b/i,
    ]) {
      expect(code).not.toMatch(forbidden);
    }
  });
});

// ═══════════════════════════════════════════════════════ completion ════════
describe("completion conditions", () => {
  const complete: MissionStateData = {
    ...emptyMissionState,
    choices: {
      decision1_move: "a",
      decision2_move: "c",
      judgement_card: "reconsider_1",
    },
    visitedScreens: ["later_evidence"],
    respondedScreens: ["final_judgement"],
  };

  it("completes when every required stage is done", () => {
    expect(isMissionComplete(RULE, complete)).toBe(true);
  });

  it("any Judgement card completes — none is correct", () => {
    for (const card of ["stand_by_both", "reconsider_1", "reconsider_2"]) {
      expect(
        isMissionComplete(RULE, {
          ...complete,
          choices: { ...complete.choices, judgement_card: card },
        }),
      ).toBe(true);
    }
  });

  it.each([
    [
      "first decision missing",
      { choices: { decision2_move: "a", judgement_card: "stand_by_both" } },
    ],
    [
      "second decision missing",
      { choices: { decision1_move: "a", judgement_card: "stand_by_both" } },
    ],
    ["Later Evidence unseen", { visitedScreens: [] }],
    [
      "no Judgement card",
      { choices: { decision1_move: "a", decision2_move: "c" } },
    ],
    ["no Final Judgement", { respondedScreens: [] }],
  ])("does not complete when %s", (_label, patch) => {
    expect(
      isMissionComplete(RULE, { ...complete, ...patch } as MissionStateData),
    ).toBe(false);
  });

  it("requires no upload", () => {
    expect(JSON.stringify(RULE)).not.toMatch(
      /upload|evidence_uploaded|storage/i,
    );
  });

  it("the seeded rule matches", () => {
    for (const kind of ["choice_exists", "screen_visited", "response_exists"]) {
      expect(seed).toContain(kind);
    }
    expect(seed).toContain("'screenKey', 'later_evidence'");
    expect(seed).toContain("'screenKey', 'final_judgement'");
  });
});

// ═══════════════════════════════════════════════ Mission Trail (no upload) ══
describe("Mission Trail", () => {
  it("creates three physical entries and one digital, with no upload", () => {
    const config = parseScreenConfig("completion", {
      message: "Done.",
      trailEntries: [
        {
          type: "physical",
          title: "Six Names Mission Board",
          description: "…",
        },
        {
          type: "physical",
          title: "What's Changing? tracker",
          description: "…",
        },
        { type: "physical", title: "Final Judgement card", description: "…" },
        {
          type: "digital",
          title: "What I stand by now",
          fromResponse: "final_judgement",
        },
      ],
    });
    expect(
      config.trailEntries.filter((e) => e.type === "physical"),
    ).toHaveLength(3);
    expect(
      config.trailEntries.filter((e) => e.type === "digital"),
    ).toHaveLength(1);
  });

  it("physical entries never claim a stored file", () => {
    // Architecture §15 / Brief §27 — the Academy must not imply it holds the
    // artefact. The insert hard-codes a null storage_path.
    expect(access).toContain(
      "-- Physical evidence has no file, and must never pretend otherwise.",
    );
    expect(access).toMatch(
      /type = 'physical'\s*\n\s*or storage_path is not null/,
    );
  });

  it("Trail creation is atomic with completion", () => {
    const fn = access.slice(access.indexOf("function complete_mission"));
    expect(fn).toContain("insert into mission_evidence");
    expect(fn).toContain("set status           = 'complete'");
  });
});

// ════════════════════════════════════ staged information (C9-1 / Q4) ═══════
describe("staged information is server-authoritative", () => {
  it("an entitled client cannot read mission_screens directly", () => {
    expect(access).toContain(
      'drop policy if exists "screens require entitlement" on mission_screens',
    );
    // Nothing re-grants a client-readable select on the table.
    expect(access).not.toMatch(
      /create policy[^;]*on mission_screens[^;]*for select/,
    );
  });

  it("a server-authorised request retrieves only the current screen", () => {
    const fn = access.slice(
      access.indexOf("function get_current_mission_screen"),
    );
    expect(fn).toContain("and s.screen_key = v_progress.current_screen_key");
    expect(fn).toContain("security definer");
  });

  it("the full chain is re-established inside the function", () => {
    const fn = access.slice(
      access.indexOf("function get_current_mission_screen"),
    );
    expect(fn).toContain("if not owns_child(p_child_id) then");
    expect(fn).toContain("from mission_entitlements e");
    expect(fn).toContain("and e.status = 'active'");
  });

  it("Later Evidence cannot be retrieved before its stage", () => {
    // It is reachable only as current_screen_key, which only tracker2's
    // configured `next` can set.
    const fn = access.slice(
      access.indexOf("function get_current_mission_screen"),
    );
    expect(fn).not.toContain("later_evidence");
    expect(seed).toContain("'next', 'later_evidence'");

    const state = { ...emptyMissionState };
    const tracker2 = byKey("tracker2");
    expect(resolveNextScreen(tracker2, nextBySequence("tracker2"), state)).toBe(
      "later_evidence",
    );
    // ...and nothing earlier resolves to it.
    for (const key of [
      "mission_brief",
      "zone1_list",
      "decision1_move",
      "tracker1",
    ]) {
      expect(
        resolveNextScreen(byKey(key), nextBySequence(key), state),
      ).not.toBe("later_evidence");
    }
  });

  it("a future consequence cannot be retrieved before its branch", () => {
    // consequence1_c is reachable only by choosing option c.
    const chose_a = play([
      ...upToDecision1,
      { kind: "choice", screenKey: "decision1_move", optionId: "a" },
    ]);
    expect(chose_a.visited).not.toContain("consequence1_b");
    expect(chose_a.visited).not.toContain("consequence1_c");
  });

  it("an interaction for a screen the child is not on is refused", () => {
    expect(persistence).toContain(
      "That interaction does not belong to the current step.",
    );
  });

  it("cross-family access remains impossible", () => {
    // owns_child resolves through auth.uid(), so another family's child id
    // raises before any screen is read.
    expect(access).toContain("raise exception 'not_your_child'");
    expect(persistence).toContain("requireEntitledMission(");
  });

  it("every function that reads mission_screens is security definer", () => {
    /*
     * REGRESSION GUARD — migration 0008.
     *
     * 0007 removed all client read access to mission_screens. start_mission
     * was security INVOKER, so it silently lost its ability to find a
     * mission's first screen and every new run opened with a null position.
     * Source-level tests could not see this; live execution found it.
     *
     * Any function that reads mission_screens must therefore be definer, and
     * must re-establish ownership and entitlement itself.
     */
    const startFix = readFileSync(
      join(repo, "supabase/migrations/0008_start_mission_access.sql"),
      "utf8",
    );
    for (const [sql, fn] of [
      [startFix, "start_mission"],
      [access, "get_current_mission_screen"],
    ] as const) {
      const body = sql.slice(sql.indexOf(`function ${fn}`));
      const upToEnd = body.slice(0, body.indexOf("$$;") + 3);
      expect(upToEnd, `${fn} must be security definer`).toContain("security definer");
      expect(upToEnd, `${fn} must check ownership`).toContain("owns_child(p_child_id)");
      expect(upToEnd, `${fn} must check entitlement`).toContain("mission_entitlements");
      expect(upToEnd, `${fn} must read screens`).toContain("mission_screens");
    }
  });

  it("the client is never given more than one screen", () => {
    expect(persistence).toContain("get_current_mission_screen");
    expect(persistence).not.toMatch(/from\("mission_screens"\)/);
  });
});

// ════════════════════════════════════════════ Mission Control boundaries ════
describe("Mission Control", () => {
  it("is configured in the seed, never hard-coded in a component", () => {
    const component = readFileSync(
      join(repo, "src/components/mission/mission-control.tsx"),
      "utf8",
    );
    expect(component).not.toMatch(/What do I know\?|What am I assuming\?/);
    expect(seed).toContain("What do I know?");
    expect(seed).toContain("What am I assuming?");
  });

  it("appears only on the seven approved screens", () => {
    const withSupport = [
      "zone1_list",
      "decision1_concerns",
      "decision1_move",
      "list_changes",
      "decision2_concerns",
      "decision2_move",
      "later_evidence",
    ];
    for (const key of withSupport) {
      expect(screenBlock(key), key).toContain("'What do I know?'");
    }

    // ...and nowhere else. Support is deliberately limited (Q3).
    const withoutSupport = [
      "mission_brief",
      "prepare",
      "tracker1",
      "tracker2",
      "judgement_card",
      "judgement_reflection",
      "final_judgement",
      "complete",
    ];
    for (const key of withoutSupport) {
      expect(screenBlock(key), key).not.toContain("'What do I know?'");
    }
  });

  it("never reveals the meaning of the list or Later Evidence early", () => {
    // Support on pre-reveal screens must not contain the explanation.
    const preReveal =
      screenBlock("zone1_list") +
      screenBlock("decision1_concerns") +
      screenBlock("decision1_move");
    expect(preReveal).not.toMatch(/contribution.{0,40}checking list/i);
    expect(preReveal).not.toMatch(/was not created to identify/i);
  });

  it("never recommends an option", () => {
    const support = seed.match(/'body', '[^']*'/g) ?? [];
    for (const line of support) {
      expect(line).not.toMatch(
        /you should choose|the best option|we recommend|the right answer/i,
      );
    }
  });

  it("opening it cannot advance mission state", () => {
    const component = readFileSync(
      join(repo, "src/components/mission/mission-control.tsx"),
      "utf8",
    );
    expect(component).not.toContain("onAdvance");
    expect(component).not.toContain("recordInteraction");
  });
});

// ═══════════════════════════════════════════════════ seed integrity ════════
describe("seed integrity", () => {
  it("declares all 21 screens", () => {
    expect(seed.match(/\(m, 1, '[a-z0-9_]+'/g)).toHaveLength(21);
  });

  it("every branch target and `next` refers to a declared screen", () => {
    const declared = new Set(
      (seed.match(/\(m, 1, '([a-z0-9_]+)'/g) ?? []).map((m) =>
        m.replace(/\(m, 1, '/, "").replace(/'$/, ""),
      ),
    );
    const referenced = (seed.match(/'next', '([a-z0-9_]+)'/g) ?? []).map((m) =>
      m.replace(/'next', '/, "").replace(/'$/, ""),
    );
    expect(referenced.length).toBeGreaterThan(0);
    for (const target of referenced) {
      expect(
        declared.has(target),
        `${target} is referenced but not declared`,
      ).toBe(true);
    }
  });

  it("contains no score, badge, streak or ranking language", () => {
    for (const forbidden of [
      /\bscore\b/i,
      /badge/i,
      /streak/i,
      /leaderboard/i,
      /\brank\b/i,
      /points/i,
    ]) {
      const matches = seed.match(forbidden) ?? [];
      // "not a score" is the one permitted mention.
      for (const match of matches) {
        const at = seed.indexOf(match);
        expect(seed.slice(Math.max(0, at - 20), at + 10)).toMatch(
          /not a score/i,
        );
      }
    }
  });

  it("asks for no real names, school details or identifying information", () => {
    expect(seed).toContain("You do not need to enter any real names");
    expect(seed).not.toMatch(/your school|real name of|classmate's name/i);
  });

  it("every screen in the graph has a registered component type", () => {
    const renderer = readFileSync(
      join(repo, "src/features/mission-engine/renderer.tsx"),
      "utf8",
    );
    for (const type of new Set(graph.map((s) => s.type))) {
      expect(renderer, `${type} must be registered`).toContain(`${type}:`);
    }
  });
});

/** The seed text for one screen: its declaration up to the next declaration. */
function screenBlock(key: string): string {
  const start = seed.indexOf(`(m, 1, '${key}'`);
  if (start === -1) throw new Error(`${key} is not declared in the seed`);
  const next = seed.indexOf("(m, 1, '", start + 10);
  return seed.slice(start, next === -1 ? undefined : next);
}
