import { describe, expect, it } from "vitest";
import {
  emptyMissionState,
  isMissionComplete,
  isRevealed,
  markVisited,
  resolveNextScreen,
  resolveResumeScreen,
  screenAfterInteraction,
  applyInteraction,
  type MissionScreen,
} from "../index";

/**
 * Tech Spec §57 requires branch and reveal behaviour to survive refresh and
 * return. Because navigation is pure, that behaviour is testable here rather
 * than only through the UI.
 */

const screens: MissionScreen[] = [
  {
    screenKey: "intro",
    type: "content",
    title: "Intro",
    body: null,
    sequence: 1,
    configuration: {},
  },
  {
    screenKey: "pick",
    type: "choice",
    title: "Pick",
    body: null,
    sequence: 2,
    configuration: {
      prompt: "Which way?",
      options: [
        { id: "a", label: "Left", next: "left_path" },
        { id: "b", label: "Right", next: "right_path" },
      ],
      locksOnConfirm: false,
    },
  },
  {
    screenKey: "left_path",
    type: "content",
    title: "Left",
    body: null,
    sequence: 3,
    configuration: {},
  },
  {
    screenKey: "right_path",
    type: "content",
    title: "Right",
    body: null,
    sequence: 4,
    configuration: {},
  },
];

const screenByKey = (key: string) => screens.find((s) => s.screenKey === key)!;

describe("resolveNextScreen", () => {
  it("advances by sequence when no branch or explicit next is set", () => {
    expect(
      resolveNextScreen(
        screenByKey("intro"),
        nextBySequence(screens, screenByKey("intro").screenKey),
        emptyMissionState,
      ),
    ).toBe("pick");
  });

  it("follows the branch the child established", () => {
    const state = { ...emptyMissionState, choices: { pick: "b" } };
    expect(
      resolveNextScreen(
        screenByKey("pick"),
        nextBySequence(screens, screenByKey("pick").screenKey),
        state,
      ),
    ).toBe("right_path");
  });

  it("returns null at the end of the mission", () => {
    expect(
      resolveNextScreen(
        screenByKey("right_path"),
        nextBySequence(screens, screenByKey("right_path").screenKey),
        emptyMissionState,
      ),
    ).toBeNull();
  });
});

describe("resolveResumeScreen", () => {
  it("returns the child to their saved position", () => {
    expect(resolveResumeScreen(screens, "left_path")).toBe("left_path");
  });

  it("falls back to the first screen when the saved position is stale", () => {
    // Guards Tech Spec §53: a mission edit must not strand a child mid-run.
    expect(resolveResumeScreen(screens, "deleted_screen")).toBe("intro");
  });
});

describe("isRevealed", () => {
  const reveal: MissionScreen = {
    screenKey: "hint",
    type: "reveal",
    title: null,
    body: null,
    sequence: 5,
    configuration: {
      concealedPrompt: "Something is hidden here.",
      revealedBody: "Here it is.",
      condition: { type: "choice_equals", screenKey: "pick", optionId: "a" },
    },
  };

  it("stays concealed until the condition is met", () => {
    expect(isRevealed(reveal, emptyMissionState)).toBe(false);
  });

  it("unlocks from an earlier choice", () => {
    expect(
      isRevealed(reveal, { ...emptyMissionState, choices: { pick: "a" } }),
    ).toBe(true);
  });

  it("stays revealed once revealed, regardless of condition", () => {
    // Architecture §13: "revealed information remains revealed".
    expect(
      isRevealed(reveal, { ...emptyMissionState, revealed: ["hint"] }),
    ).toBe(true);
  });
});

describe("isMissionComplete", () => {
  it("completes when the target screen has been reached", () => {
    const state = { ...emptyMissionState, visitedScreens: ["intro", "done"] };
    expect(
      isMissionComplete(
        { type: "screen_reached", screenKey: "done" },
        state,
        [],
      ),
    ).toBe(true);
  });

  it("requires every condition when conditions are configured", () => {
    const state = { ...emptyMissionState, choices: { pick: "a" } };
    const rule = {
      type: "conditions" as const,
      conditions: [
        { kind: "choice_equals" as const, screenKey: "pick", optionId: "a" },
        { kind: "response_exists" as const, screenKey: "reflect" },
      ],
    };
    expect(isMissionComplete(rule, state, [])).toBe(false);
    expect(isMissionComplete(rule, state, ["reflect"])).toBe(true);
  });
});

describe("markVisited", () => {
  it("does not duplicate an existing visit", () => {
    const once = markVisited(emptyMissionState, "intro");
    expect(markVisited(once, "intro").visitedScreens).toEqual(["intro"]);
  });
});

/** Mirrors what get_current_mission_screen returns as `next_sequence_key`. */
function nextBySequence(
  screens: MissionScreen[],
  currentKey: string,
): string | null {
  const ordered = [...screens].sort((a, b) => a.sequence - b.sequence);
  const i = ordered.findIndex((s) => s.screenKey === currentKey);
  return ordered[i + 1]?.screenKey ?? null;
}

describe("a reveal unlocks in place (Six Names Evidence)", () => {
  /*
   * Found in staging QA: opening Evidence advanced to the next handoff, so the
   * child never saw what was revealed. The reveal must keep the child on the
   * screen; the screen's own Continue (a visit) is what advances.
   */
  const evidence: MissionScreen = {
    screenKey: "evidence",
    type: "reveal",
    title: "Evidence",
    body: null,
    sequence: 140,
    configuration: {
      concealedPrompt: "What was the list for?",
      revealLabel: "Open Evidence",
      revealedBody: "The names belonged to pupils whose records needed checking.",
      condition: { type: "child_action" },
      next: "handoff_step11",
    },
  };

  it("revealing keeps the child on the screen, now revealed", () => {
    const state = applyInteraction(emptyMissionState, { kind: "reveal", screenKey: "evidence" });
    expect(screenAfterInteraction({ kind: "reveal", screenKey: "evidence" }, evidence, "handoff_step11", state))
      .toBe("evidence");
    expect(isRevealed(evidence, state)).toBe(true);
  });

  it("Continue on the revealed screen then advances to its next", () => {
    const state = applyInteraction(emptyMissionState, { kind: "reveal", screenKey: "evidence" });
    expect(screenAfterInteraction({ kind: "visit", screenKey: "evidence" }, evidence, null, state))
      .toBe("handoff_step11");
  });
});
