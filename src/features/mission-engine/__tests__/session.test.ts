import { describe, expect, it } from "vitest";
import {
  applyInteraction,
  emptyMissionState,
  parseMissionState,
  resolveNextScreen,
  resolveResumeScreen,
  type MissionInteraction,
  type MissionScreen,
  type MissionStateData,
} from "../index";
import type { MissionStatus } from "@/types/database";

/**
 * BEHAVIOURAL SESSION TESTS
 *
 * These drive the REAL reducer and REAL navigation through a fake store whose
 * semantics mirror supabase/migrations/0003_persistence.sql — the idempotent
 * upsert, the position coalesce, the complete-is-terminal guard, and the
 * all-or-nothing write.
 *
 * WHAT THIS DOES NOT PROVE: that Postgres behaves as modelled. The migration's
 * clauses are asserted separately in persistence.test.ts, and live verification
 * is Sprint 10. Between them they cover the contract from both sides.
 */

const screens: MissionScreen[] = [
  {
    screenKey: "intro",
    type: "content",
    title: null,
    body: null,
    sequence: 1,
    configuration: {},
  },
  {
    screenKey: "pick",
    type: "choice",
    title: null,
    body: null,
    sequence: 2,
    configuration: {
      prompt: "Which concern matters most?",
      options: [
        { id: "a", label: "A", next: "branch_a" },
        { id: "b", label: "B", next: "branch_b" },
      ],
      locksOnConfirm: false,
    },
  },
  {
    screenKey: "branch_a",
    type: "reveal",
    title: null,
    body: null,
    sequence: 3,
    configuration: {},
  },
  {
    screenKey: "branch_b",
    type: "content",
    title: null,
    body: null,
    sequence: 4,
    configuration: {},
  },
  {
    screenKey: "reflect",
    type: "response",
    title: null,
    body: null,
    sequence: 5,
    configuration: {},
  },
];

type ProgressRow = {
  id: string;
  childId: string;
  missionId: string;
  status: MissionStatus;
  currentScreenKey: string | null;
  missionVersion: number;
  startedAt: string | null;
  completedAt: string | null;
};

/** In-memory mirror of the 0003 functions. */
class FakeStore {
  progress: ProgressRow | null = null;
  state: unknown = null;
  responses = new Map<string, unknown>();
  /** Set to make the next persist fail, as a dropped connection would. */
  failNextWrite = false;
  writes = 0;

  /** Mirrors start_mission: idempotent, never resets position or restarts. */
  startMission(childId: string, missionId: string, currentVersion: number) {
    if (!this.progress) {
      this.progress = {
        id: "progress-1",
        childId,
        missionId,
        status: "in_progress",
        currentScreenKey: screens[0].screenKey,
        missionVersion: currentVersion, // pinned at first start
        startedAt: "2026-09-26T10:00:00Z",
        completedAt: null,
      };
      this.state = {};
      return this.progress;
    }
    if (this.progress.status === "not_started") {
      this.progress.status = "in_progress";
    }
    // Position, version and started_at are never overwritten.
    return this.progress;
  }

  /** Mirrors persist_mission_state: all three writes, or none. */
  persist(
    nextState: MissionStateData,
    screenKey: string | null,
    response?: { key: string; value: unknown },
  ) {
    if (!this.progress) throw new Error("not started");
    if (this.progress.status === "complete") return this.progress;

    if (this.failNextWrite) {
      this.failNextWrite = false;
      // Nothing is mutated — this is the whole point of one transaction.
      throw new Error("network");
    }

    this.state = JSON.parse(JSON.stringify(nextState));
    if (response) this.responses.set(response.key, response.value);
    this.progress.currentScreenKey =
      screenKey ?? this.progress.currentScreenKey;
    this.writes += 1;
    return this.progress;
  }

  /** What a fresh page load sees — nothing carried from the previous session. */
  read() {
    return {
      progress: this.progress ? { ...this.progress } : null,
      state: parseMissionState(this.state),
      responses: new Map(this.responses),
    };
  }
}

/**
 * The real advance path: reduce → resolve next → persist → only then advance.
 * Mirrors recordInteraction, including its ordering.
 */
function advance(
  store: FakeStore,
  state: MissionStateData,
  interaction: MissionInteraction,
): { state: MissionStateData; ok: boolean } {
  const nextState = applyInteraction(state, interaction);

  let nextScreenKey = store.progress?.currentScreenKey ?? null;
  if (interaction.kind !== "custom") {
    const current =
      screens.find((s) => s.screenKey === interaction.screenKey) ?? null;
    if (current)
      nextScreenKey = resolveNextScreen(
        current,
        nextBySequence(screens, current.screenKey),
        nextState,
      );
  }

  try {
    store.persist(
      nextState,
      nextScreenKey,
      interaction.kind === "response"
        ? { key: interaction.screenKey, value: interaction.value }
        : undefined,
    );
  } catch {
    // D-18: persistence failed, so nothing advances. The caller keeps the
    // state it already had.
    return { state, ok: false };
  }

  return { state: nextState, ok: true };
}

// ════════════════════ TEST 1 — start → interact → leave → return → continue ══
describe("start → interact → leave → return → Continue", () => {
  it("resumes correctly with everything the child did intact", () => {
    const store = new FakeStore();

    // ── Start ──────────────────────────────────────────────────────────────
    const started = store.startMission("child-1", "mission-1", 3);
    expect(started.status).toBe("in_progress");
    expect(started.missionVersion).toBe(3);

    // ── Interact ───────────────────────────────────────────────────────────
    let state = emptyMissionState;
    ({ state } = advance(store, state, { kind: "visit", screenKey: "intro" }));
    ({ state } = advance(store, state, {
      kind: "choice",
      screenKey: "pick",
      optionId: "a",
    }));
    ({ state } = advance(store, state, {
      kind: "reveal",
      screenKey: "branch_a",
    }));
    ({ state } = advance(store, state, {
      kind: "response",
      screenKey: "reflect",
      value: "I changed my mind about the list.",
    }));

    // ── Leave ──────────────────────────────────────────────────────────────
    // Every client-side reference is discarded. This is the child closing the
    // tab, the laptop sleeping, or coming back the next day.
    state = emptyMissionState as MissionStateData;

    // The mission definition is updated while they are away.
    const currentMissionVersion = 4;

    // ── Return ─────────────────────────────────────────────────────────────
    const session = store.read();

    // ...mission remains In Progress
    expect(session.progress?.status).toBe("in_progress");

    // ...recorded mission version is unchanged despite the mission moving on
    expect(session.progress?.missionVersion).toBe(3);
    expect(session.progress?.missionVersion).not.toBe(currentMissionVersion);

    // ── Continue ───────────────────────────────────────────────────────────
    const resumeTo = resolveResumeScreen(
      screens,
      session.progress?.currentScreenKey ?? null,
    );

    // ...returns to the appropriate position
    expect(resumeTo).toBe(session.progress?.currentScreenKey);
    expect(resumeTo).not.toBeNull();

    // ...established branch remains
    expect(session.state.choices.pick).toBe("a");

    // ...reveal remains
    expect(session.state.revealed).toContain("branch_a");

    // ...saved response remains
    expect(session.state.respondedScreens).toContain("reflect");
    expect(session.responses.get("reflect")).toBe(
      "I changed my mind about the list.",
    );

    // ...and the branch still resolves the way the child established it
    const pick = screens.find((s) => s.screenKey === "pick")!;
    expect(
      resolveNextScreen(
        pick,
        nextBySequence(screens, pick.screenKey),
        session.state,
      ),
    ).toBe("branch_a");
  });

  it("Start after returning resumes rather than restarting", () => {
    const store = new FakeStore();
    store.startMission("child-1", "mission-1", 1);

    let state: MissionStateData = emptyMissionState;
    ({ state } = advance(store, state, {
      kind: "choice",
      screenKey: "pick",
      optionId: "b",
    }));
    const positionBeforeRestart = store.progress!.currentScreenKey;
    const startedAtBefore = store.progress!.startedAt;

    // Tech Spec §27 — clicking Start again must not create a second run.
    store.startMission("child-1", "mission-1", 5);

    expect(store.progress!.currentScreenKey).toBe(positionBeforeRestart);
    expect(store.progress!.startedAt).toBe(startedAtBefore);
    expect(store.progress!.missionVersion).toBe(1); // NOT re-pinned to 5
    expect(store.read().state.choices.pick).toBe("b");
  });
});

// ═══════════════════════════════ TEST 2 — failed interaction persistence ════
describe("failed interaction persistence", () => {
  it("does not advance, does not save, and can be retried", () => {
    const store = new FakeStore();
    store.startMission("child-1", "mission-1", 1);

    let state: MissionStateData = emptyMissionState;
    ({ state } = advance(store, state, { kind: "visit", screenKey: "intro" }));

    const positionBefore = store.progress!.currentScreenKey;
    const stateBefore = store.read().state;
    const writesBefore = store.writes;

    // ── The write fails ────────────────────────────────────────────────────
    store.failNextWrite = true;
    const failed = advance(store, state, {
      kind: "response",
      screenKey: "reflect",
      value: "an answer that never reached the server",
    });

    // ...the mission does not advance
    expect(failed.ok).toBe(false);
    expect(store.progress!.currentScreenKey).toBe(positionBefore);

    // ...the interaction is not treated as saved
    expect(store.read().state).toEqual(stateBefore);
    expect(store.read().state.respondedScreens).not.toContain("reflect");
    expect(store.responses.has("reflect")).toBe(false);
    expect(store.writes).toBe(writesBefore);

    // ...and the caller keeps the state it had, so the UI shows no transition
    expect(failed.state).toEqual(state);

    // ── Retry ──────────────────────────────────────────────────────────────
    const retried = advance(store, failed.state, {
      kind: "response",
      screenKey: "reflect",
      value: "an answer that reached the server",
    });

    expect(retried.ok).toBe(true);
    expect(store.read().state.respondedScreens).toContain("reflect");
    expect(store.responses.get("reflect")).toBe(
      "an answer that reached the server",
    );
    expect(store.writes).toBe(writesBefore + 1);
  });

  it("a partial write is impossible — state, response and position move together", () => {
    const store = new FakeStore();
    store.startMission("child-1", "mission-1", 1);

    store.failNextWrite = true;
    advance(store, emptyMissionState, {
      kind: "response",
      screenKey: "reflect",
      value: "x",
    });

    // None of the three landed.
    expect(store.state).toEqual({});
    expect(store.responses.size).toBe(0);
    expect(store.progress!.currentScreenKey).toBe("intro");
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
