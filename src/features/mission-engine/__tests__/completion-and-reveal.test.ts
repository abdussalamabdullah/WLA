import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions", () => ({ requireEntitledMission: vi.fn() }));
vi.mock("@/lib/analytics/events", () => ({ recordEvent: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({ logError: vi.fn(), logWarn: vi.fn() }));

const { recordInteractionVia } = await import("../persistence");
const { emptyMissionState } = await import("../index");

/*
 * Two defects found in staging browser QA, both invisible to the existing
 * suites, driven here through the real engine with a recording gateway:
 *   1. a reveal advanced past the revealed screen (Six Names Evidence never shown)
 *   2. a response that completes the mission was dropped before completion,
 *      so completion failed ("That didn't save.") and the answer was lost
 */
type Call = { op: string; args: Record<string, unknown> };

function gatewayFor(screen: Record<string, unknown>, rule: unknown, nextSequenceKey: string | null) {
  const calls: Call[] = [];
  const progress = { id: "p1", status: "in_progress", current_screen_key: screen.screenKey, completion_rule: rule };
  return {
    calls,
    gateway: {
      childId: "c1",
      async loadStage() {
        return { mission: { id: "m1", completion_rule: rule }, progress, screen, nextSequenceKey, state: emptyMissionState };
      },
      async persist(args: Record<string, unknown>) { calls.push({ op: "persist", args }); return { ...progress, current_screen_key: args.screenKey }; },
      async complete(args: Record<string, unknown>) { calls.push({ op: "complete", args }); return { ...progress, status: "complete", current_screen_key: null }; },
      async recordEvent() {},
    },
  };
}

describe("a reveal unlocks in place, through the real engine", () => {
  it("persists the child on the SAME screen after opening Evidence", async () => {
    const evidence = {
      screenKey: "evidence", type: "reveal", title: "Evidence", body: null, sequence: 140,
      configuration: { concealedPrompt: "?", revealLabel: "Open Evidence", revealedBody: "x", condition: { type: "child_action" }, next: "handoff_step11" },
    };
    const { gateway, calls } = gatewayFor(evidence, { type: "screen_reached", screenKey: "never" }, null);
    const r = await recordInteractionVia(gateway as never, { kind: "reveal", screenKey: "evidence" });
    expect(calls[0].op).toBe("persist");
    expect(calls[0].args.screenKey).toBe("evidence");
    expect(r.state.revealed).toContain("evidence");
  });
});

describe("a completing response is kept", () => {
  it("saves the answer BEFORE completing, then completes", async () => {
    const wrap = {
      screenKey: "wrap", type: "response", title: "Looking back", body: null, sequence: 50,
      configuration: { prompt: "What did you notice?", next: "finish" },
    };
    const rule = { type: "conditions", conditions: [{ kind: "response_exists", screenKey: "wrap" }] };
    const { gateway, calls } = gatewayFor(wrap, rule, "finish");
    const r = await recordInteractionVia(gateway as never, { kind: "response", screenKey: "wrap", value: "The gate was open." });
    expect(calls.map((c) => c.op)).toEqual(["persist", "complete"]);
    expect(calls[0].args.responseKey).toBe("wrap");
    expect(calls[0].args.responseValue).toBe("The gate was open.");
    expect(r.completed).toBe(true);
  });

  it("a non-response completion still goes straight to complete (Six Names)", async () => {
    const fj = {
      screenKey: "final_judgement", type: "content", title: "Final Judgement", body: null, sequence: 180,
      configuration: { next: "complete", actionLabel: "Complete Mission" },
    };
    const rule = { type: "conditions", conditions: [{ kind: "screen_visited", screenKey: "final_judgement" }] };
    const { gateway, calls } = gatewayFor(fj, rule, null);
    await recordInteractionVia(gateway as never, { kind: "visit", screenKey: "final_judgement" });
    expect(calls.map((c) => c.op)).toEqual(["complete"]);
  });
});
