import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyInteraction,
  emptyMissionState,
  isMissionComplete,
  missionInteraction,
  parseMissionState,
  resolveNextScreen,
  resolveResumeScreen,
  type MissionScreen,
  type MissionStateData,
} from "../index";

const repo = join(__dirname, "../../../..");
const migration = readFileSync(
  join(repo, "supabase/migrations/20260925220200_persistence.sql"),
  "utf8",
);
const persistence = readFileSync(
  join(repo, "src/features/mission-engine/persistence.ts"),
  "utf8",
);

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
      prompt: "Which way?",
      options: [
        { id: "a", label: "Left", next: "left" },
        { id: "b", label: "Right", next: "right" },
      ],
      locksOnConfirm: false,
    },
  },
  {
    screenKey: "left",
    type: "content",
    title: null,
    body: null,
    sequence: 3,
    configuration: {},
  },
  {
    screenKey: "right",
    type: "handoff",
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

/** Replay a sequence of interactions, as a real session would. */
function replay(interactions: Parameters<typeof applyInteraction>[1][]) {
  return interactions.reduce(applyInteraction, emptyMissionState);
}

// ────────────────────────────────────────────────── 3. state writes are additive ──
describe("state transitions", () => {
  it("records a choice and marks the screen visited", () => {
    const state = applyInteraction(emptyMissionState, {
      kind: "choice",
      screenKey: "pick",
      optionId: "b",
    });
    expect(state.choices.pick).toBe("b");
    expect(state.visitedScreens).toContain("pick");
  });

  it("never removes an established branch or reveal", () => {
    // Architecture §13: branches stay established, reveals stay revealed.
    const state = replay([
      { kind: "choice", screenKey: "pick", optionId: "a" },
      { kind: "reveal", screenKey: "hint" },
      { kind: "visit", screenKey: "left" },
    ]);
    expect(state.choices.pick).toBe("a");
    expect(state.revealed).toContain("hint");
  });

  it("re-answering overwrites the choice without losing history", () => {
    const state = replay([
      { kind: "choice", screenKey: "pick", optionId: "a" },
      { kind: "choice", screenKey: "pick", optionId: "b" },
    ]);
    expect(state.choices.pick).toBe("b");
    expect(state.visitedScreens.filter((s) => s === "pick")).toHaveLength(1);
  });

  it("does not duplicate reveals, handoffs or responses", () => {
    const state = replay([
      { kind: "reveal", screenKey: "hint" },
      { kind: "reveal", screenKey: "hint" },
      { kind: "handoff", screenKey: "build" },
      { kind: "handoff", screenKey: "build" },
      { kind: "response", screenKey: "reflect", value: "x" },
      { kind: "response", screenKey: "reflect", value: "y" },
    ]);
    expect(state.revealed).toEqual(["hint"]);
    expect(state.confirmedHandoffs).toEqual(["build"]);
    expect(state.respondedScreens).toEqual(["reflect"]);
  });

  it("carries mission-specific state through `custom` without a per-mission branch", () => {
    const state = applyInteraction(emptyMissionState, {
      kind: "custom",
      key: "trackerPosition",
      value: { spread: 2 },
    });
    expect(state.custom.trackerPosition).toEqual({ spread: 2 });
  });

  it("rejects an interaction kind outside the Tech Spec §29 save points", () => {
    // Transient UI state must never reach persistence.
    for (const bad of [
      { kind: "hover", screenKey: "intro" },
      { kind: "tooltipOpen", screenKey: "intro" },
      { kind: "scroll", screenKey: "intro", offset: 120 },
    ]) {
      expect(missionInteraction.safeParse(bad).success).toBe(false);
    }
  });
});

// ──────────────────────────────────────────── 4/5/6. pause, refresh, return ──
describe("pause and resume", () => {
  it("returns the child to their saved position", () => {
    expect(resolveResumeScreen(screens, "left")).toBe("left");
  });

  it("survives a mission edit that removed the saved screen", () => {
    // Tech Spec §53 — a stale position must not strand a child.
    expect(resolveResumeScreen(screens, "deleted")).toBe("intro");
  });

  it("resumes onto the branch the child established, not the sequence", () => {
    const state = replay([
      { kind: "choice", screenKey: "pick", optionId: "b" },
    ]);
    const pick = screens.find((s) => s.screenKey === "pick")!;
    expect(
      resolveNextScreen(pick, nextBySequence(screens, pick.screenKey), state),
    ).toBe("right");
  });

  it("reconstructs identically from persisted JSON", () => {
    // Refresh and leave-and-return are the same path: state round-trips
    // through the database with nothing held in the browser.
    const before = replay([
      { kind: "choice", screenKey: "pick", optionId: "a" },
      { kind: "reveal", screenKey: "hint" },
      { kind: "response", screenKey: "reflect", value: "something" },
    ]);
    const after = parseMissionState(JSON.parse(JSON.stringify(before)));
    expect(after).toEqual(before);
  });

  it("degrades to empty state rather than locking a child out", () => {
    for (const corrupt of [null, undefined, "nonsense", { choices: 42 }]) {
      expect(parseMissionState(corrupt)).toEqual(emptyMissionState);
    }
  });
});

// ─────────────────────────────────────────────── 7. duplicate-start protection ──
describe("duplicate-start protection", () => {
  it("one progress row per child and mission, enforced by the database", () => {
    const init = readFileSync(
      join(repo, "supabase/migrations/20260925220000_init.sql"),
      "utf8",
    );
    expect(init).toContain("unique (child_id, mission_id)");
  });

  it("start_mission upserts rather than inserting", () => {
    expect(migration).toContain("on conflict (child_id, mission_id) do update");
  });

  it("start_mission never resets a saved position", () => {
    // coalesce keeps the existing position; excluded is only the fallback.
    expect(migration).toMatch(
      /current_screen_key = coalesce\(\s*mission_progress\.current_screen_key, excluded\.current_screen_key\s*\)/,
    );
  });

  it("start_mission never restarts a completed mission", () => {
    // Architecture §17; replay is deferred.
    expect(migration).toContain(
      "when mission_progress.status = 'not_started' then 'in_progress'",
    );
    expect(migration).toContain("else mission_progress.status");
  });

  it("started_at is set once and never moved", () => {
    expect(migration).toContain(
      "started_at = coalesce(mission_progress.started_at, now())",
    );
  });
});

// ─────────────────────────────────────────────── 8. child-scoped authorization ──
describe("child-scoped authorization", () => {
  it("every entry point goes through requireEntitledMission", () => {
    for (const fn of ["getMissionStage", "startMission"]) {
      const body = persistence.slice(
        persistence.indexOf(`export async function ${fn}`),
      );
      const upToNext = body.slice(0, body.indexOf("\nexport ", 10));
      expect(upToNext, fn).toContain("requireEntitledMission(");
    }
  });

  /*
   * recordInteraction now reaches the database through a gateway, so that the
   * reducer, canonical tracker and completion logic are not duplicated for
   * child sessions (D-59). The parent path must still run the permissions
   * chain — this follows the one indirection rather than accepting it.
   */
  it("the parent gateway still runs the permissions chain", () => {
    const entry = persistence.slice(
      persistence.indexOf("export async function recordInteraction("),
    );
    const upToNext = entry.slice(0, entry.indexOf("\n/**"));
    expect(upToNext, "recordInteraction must delegate to parentGateway")
      .toContain("parentGateway(");

    const gw = persistence.slice(persistence.indexOf("export function parentGateway("));
    const gwBody = gw.slice(0, gw.indexOf("\nexport ", 10));
    // Every database operation the gateway performs re-establishes access.
    expect(
      gwBody.match(/requireEntitledMission\(/g),
      "each parent gateway write must re-establish entitlement",
    ).toHaveLength(2);
    expect(gwBody).toContain("getMissionStage(childId, missionIdOrSlug)");
  });

  it("the shared interaction logic never takes a child id directly", () => {
    const shared = persistence.slice(
      persistence.indexOf("export async function recordInteractionVia("),
    );
    const sig = shared.slice(0, shared.indexOf("{"));
    expect(sig).not.toContain("childId: string");
  });

  it("the database functions re-check ownership independently", () => {
    expect(migration).toContain("if not owns_child(p_child_id) then");
    expect(
      migration.match(/if not owns_progress\(p_progress_id\) then/g),
    ).toHaveLength(2);
  });

  it("start_mission re-checks entitlement at the database", () => {
    expect(migration).toContain("from mission_entitlements e");
    expect(migration).toContain("and e.status = 'active'");
  });

  it("the functions run as the caller, so RLS still applies", () => {
    expect(migration).not.toContain("security definer");
    expect(migration.match(/security invoker/g)).toHaveLength(3);
  });
});

// ────────────────────────────────────────────────────── 9. atomic completion ──
describe("atomic completion", () => {
  it("state and status change inside one transaction", () => {
    const fn = migration.slice(migration.indexOf("function complete_mission"));
    const stateWrite = fn.indexOf("insert into mission_state");
    const statusWrite = fn.indexOf("set status           = 'complete'");
    // State first, then status — and both inside one function body.
    expect(stateWrite).toBeGreaterThan(-1);
    expect(statusWrite).toBeGreaterThan(stateWrite);
  });

  it("completion is idempotent", () => {
    const fn = migration.slice(migration.indexOf("function complete_mission"));
    expect(fn).toContain("completed_at     = coalesce(completed_at, now())");
  });

  it("completion is evaluated from configuration, never mission identity", () => {
    // Tech Spec §31.
    expect(persistence).toContain("mission.completion_rule");
    expect(persistence).not.toMatch(/mission\.(slug|id)\s*===?\s*["']/);
  });

  it("a mission without a completion rule never auto-completes", () => {
    expect(persistence).toContain("rule?.success === true");
  });

  it("evaluates screen_reached and conditions rules correctly", () => {
    const state: MissionStateData = replay([
      { kind: "visit", screenKey: "intro" },
      { kind: "choice", screenKey: "pick", optionId: "a" },
      { kind: "response", screenKey: "reflect", value: "done" },
    ]);

    expect(
      isMissionComplete(
        { type: "screen_reached", screenKey: "reflect" },
        state,
      ),
    ).toBe(true);
    expect(
      isMissionComplete({ type: "screen_reached", screenKey: "never" }, state),
    ).toBe(false);

    expect(
      isMissionComplete(
        {
          type: "conditions",
          conditions: [
            { kind: "choice_equals", screenKey: "pick", optionId: "a" },
            { kind: "response_exists", screenKey: "reflect" },
          ],
        },
        state,
      ),
    ).toBe(true);

    expect(
      isMissionComplete(
        {
          type: "conditions",
          conditions: [
            { kind: "choice_equals", screenKey: "pick", optionId: "b" },
          ],
        },
        state,
      ),
    ).toBe(false);
  });

  it("a completed mission accepts no further state writes", () => {
    expect(persistence).toContain('if (progress.status === "complete")');
    expect(migration).toContain("if v_progress.status = 'complete' then");
  });
});

// ──────────────────────────────────────────── authoritative state location ──
describe("Supabase holds the authoritative state", () => {
  it("no mission state is written to or read from browser storage", () => {
    // Tech Spec §29: "Do not rely on localStorage only for authoritative
    // mission state."
    const files = [
      "src/features/mission-engine/persistence.ts",
      "src/features/mission-engine/actions.ts",
      "src/features/mission-engine/navigation.ts",
      "src/app/(academy)/academy/missions/[missionId]/active/page.tsx",
    ];
    for (const file of files) {
      // Strip comments: several of these files name browser storage in order
      // to forbid it.
      const content = readFileSync(join(repo, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(content, file).not.toMatch(
        /localStorage|sessionStorage|indexedDB/,
      );
    }
  });

  it("starting a mission is a mutation, never a GET navigation", () => {
    const button = readFileSync(
      join(repo, "src/components/mission/start-mission-button.tsx"),
      "utf8",
    );
    expect(button).toContain("startMissionAction");
    expect(button).toContain("<form");
  });
});

// ══════════════════════════ D-17 — version pinning, D-18 — no blind advance ══
describe("D-17 mission version pinning", () => {
  const pinning = readFileSync(
    join(repo, "supabase/migrations/20260925220300_version_pinning.sql"),
    "utf8",
  );

  it("screens are versioned so an old definition stays retrievable", () => {
    expect(pinning).toContain("alter table mission_screens");
    expect(pinning).toContain(
      "add column if not exists version int not null default 1",
    );
    expect(pinning).toContain(
      "on mission_screens (mission_id, version, screen_key)",
    );
  });

  it("a new start uses the current published version", () => {
    expect(pinning).toContain("select m.version, m.completion_rule");
  });

  it("an existing run is never re-pinned", () => {
    expect(pinning).toContain(
      "mission_version = mission_progress.mission_version",
    );
  });

  it("completion semantics are snapshotted at start", () => {
    // Otherwise editing a live mission could leave a child unable to finish.
    expect(pinning).toContain("alter table mission_progress");
    expect(pinning).toContain("add column if not exists completion_rule jsonb");
    expect(persistence).toContain(
      "progress.completion_rule ?? mission.completion_rule",
    );
  });

  it("screen loads are filtered to the pinned version", () => {
    // Moved into the database by the screen_access migration: the application
    // can no longer read mission_screens at all, so version filtering happens
    // where the stage check does.
    const access = readFileSync(
      join(repo, "supabase/migrations/20260925220600_screen_access.sql"),
      "utf8",
    );
    expect(access).toContain("and s.version = v_progress.mission_version");
    expect(persistence).toContain("get_current_mission_screen");
  });

  it("no publishing or version-management system was introduced", () => {
    // The client asked explicitly for the minimal mechanism only.
    for (const forbidden of [
      "create table mission_versions",
      "create table mission_drafts",
      "publish_mission",
    ]) {
      expect(pinning).not.toContain(forbidden);
    }
  });
});

describe("D-18 interrupted writes", () => {
  const actions = readFileSync(
    join(repo, "src/features/mission-engine/actions.ts"),
    "utf8",
  );

  it("a failed write is a typed, retryable value — not a crash", () => {
    expect(persistence).toContain("class MissionPersistenceError");
    expect(persistence).toContain("readonly retryable = true");
    expect(actions).toContain("return { ok: false, retryable: true");
  });

  it("nothing revalidates or redirects when the write failed", () => {
    // Either would imply a transition the server never recorded.
    const catchBlock = actions.slice(
      actions.indexOf("} catch (error) {"),
      actions.indexOf("// Only reached once the write succeeded."),
    );
    expect(catchBlock).not.toContain("revalidatePath");
    expect(catchBlock).not.toContain("redirect(");
  });

  it("redirect is kept outside the try so it is not read as a failure", () => {
    // redirect() throws by design.
    const tryBlock = actions.slice(
      actions.indexOf("  try {"),
      actions.indexOf("} catch (error) {"),
    );
    expect(tryBlock).not.toContain("redirect(");
  });

  it("no offline store, retry queue or conflict resolution was added", () => {
    for (const file of ["persistence.ts", "actions.ts", "navigation.ts"]) {
      const content = readFileSync(
        join(repo, "src/features/mission-engine", file),
        "utf8",
      );
      expect(content, file).not.toMatch(
        /retryQueue|offlineQueue|conflictResolution|mergeState|serviceWorker/i,
      );
    }
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
