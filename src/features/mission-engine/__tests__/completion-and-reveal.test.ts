import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions", () => ({ requireEntitledMission: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logError: vi.fn(), logWarn: vi.fn() }));
vi.mock("../store", () => ({ loadRun: vi.fn(), saveRun: vi.fn(), recordRunEvents: vi.fn() }));

const { recordInteractionVia } = await import("../persistence");
const { emptyMissionState } = await import("../index");
const { buildModel } = await import("../definition");

/*
 * Two defects found in staging browser QA, driven through the real
 * persistence → runtime path with a recording gateway (D-80 shape):
 *   1. a reveal advanced past the revealed screen (Six Names Evidence never shown)
 *   2. a response that completes the mission was dropped before completion
 * Since the foundation, the answer and the completion are ONE engine_save.
 */
type Save = Record<string, unknown>;

function gatewayFor(screens: Record<string, unknown>[], rule: unknown, current: string) {
  const saves: Save[] = [];
  const progress = {
    id: "p1", status: "in_progress", current_screen_key: current, completion_rule: rule,
    last_activity_at: new Date().toISOString(),
  };
  const model = buildModel({ definition: {}, screens: screens as never, completionRule: rule });
  return {
    saves,
    gateway: {
      childId: "c1",
      async resolve() { return { mission: { id: "m1" }, progress, childAgeYears: null }; },
      async start() {},
      async load() { return { progress, model, state: emptyMissionState }; },
      async save(args: Save) {
        saves.push(args);
        return { ...progress, current_screen_key: args.screenKey ?? current, status: args.complete ? "complete" : "in_progress" };
      },
      async events() {},
    },
  };
}

describe("a reveal unlocks in place, through the real path", () => {
  it("persists the child on the SAME screen after opening Evidence", async () => {
    const evidence = {
      screenKey: "evidence", type: "reveal", title: "Evidence", body: null, sequence: 140,
      configuration: { concealedPrompt: "?", revealLabel: "Open Evidence", revealedBody: "x", condition: { type: "child_action" }, next: "after" },
    };
    const after = { screenKey: "after", type: "content", title: "After", body: null, sequence: 150, configuration: {} };
    const { gateway, saves } = gatewayFor([evidence, after], { type: "screen_reached", screenKey: "never" }, "evidence");
    const r = await recordInteractionVia(gateway as never, { kind: "reveal", screenKey: "evidence" });
    expect(saves[0].screenKey).toBe("evidence");
    expect(r.state.revealed).toContain("evidence");
  });
});

describe("a completing response is kept", () => {
  it("saves the answer WITH the completion, in one write", async () => {
    const wrap = {
      screenKey: "wrap", type: "response", title: "Looking back", body: null, sequence: 50,
      configuration: { prompt: "What did you notice?", next: "finish" },
    };
    const finish = { screenKey: "finish", type: "completion", title: "Done", body: null, sequence: 60, configuration: { message: "Done" } };
    const rule = { type: "conditions", conditions: [{ kind: "response_exists", screenKey: "wrap" }] };
    const { gateway, saves } = gatewayFor([wrap, finish], rule, "wrap");
    const r = await recordInteractionVia(gateway as never, { kind: "response", screenKey: "wrap", value: "The gate was open." });
    expect(saves).toHaveLength(1);
    expect(saves[0].complete).toBe(true);
    expect(saves[0].response).toEqual({ key: "wrap", value: "The gate was open." });
    expect(r.completed).toBe(true);
  });

  it("a non-response completion carries no response (Six Names)", async () => {
    const fj = {
      screenKey: "final_judgement", type: "content", title: "Final Judgement", body: null, sequence: 180,
      configuration: { next: "complete", actionLabel: "Complete Mission" },
    };
    const rule = { type: "conditions", conditions: [{ kind: "screen_visited", screenKey: "final_judgement" }] };
    const { gateway, saves } = gatewayFor([fj], rule, "final_judgement");
    await recordInteractionVia(gateway as never, { kind: "visit", screenKey: "final_judgement" });
    expect(saves).toHaveLength(1);
    expect(saves[0].complete).toBe(true);
    expect(saves[0].response).toBeNull();
  });
});
