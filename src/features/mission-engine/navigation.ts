import {
  emptyMissionState,
  parseScreenConfig,
  screenConfigByType,
  type CompletionRule,
  type MissionInteraction,
  type MissionStateData,
  type ScreenType,
} from "./schemas";

/**
 * MISSION NAVIGATION — pure functions, no I/O.
 *
 * Tech Spec §17: identify screen type → render → capture → update state →
 * determine next → persist. This module owns "determine next", kept pure so it
 * is directly unit-testable (Tech Spec §57 requires branch/reveal regression
 * tests).
 */

export type MissionScreen = {
  screenKey: string;
  type: ScreenType;
  title: string | null;
  body: string | null;
  sequence: number;
  configuration: unknown;
};

/**
 * Resolve the next screen.
 *
 * Precedence, per Tech Spec §16:
 *   1. a branch target from the child's choice on this screen
 *   2. the screen's own `next`
 *   3. the next screen by sequence
 * Returning null means the mission has run out of screens.
 *
 * Takes `nextSequenceKey` rather than the whole screen list, because the
 * engine is only ever given the child's current screen (the screen_access
 * migration).
 * Everything needed to advance is either in the current screen's own
 * configuration or is that single key.
 */
export function resolveNextScreen(
  current: MissionScreen,
  nextSequenceKey: string | null,
  state: MissionStateData,
): string | null {
  if (current.type === "choice") {
    const chosenId = state.choices[current.screenKey];
    if (chosenId) {
      const config = parseScreenConfig("choice", current.configuration);
      const option = config.options.find((o) => o.id === chosenId);
      if (option?.next) return option.next;
    }
  }

  const config = current.configuration as { next?: string } | null;
  if (config?.next) return config.next;

  return nextSequenceKey;
}

/**
 * Where does THIS interaction leave the child?
 *
 * A reveal unlocks content IN PLACE: the child stays on the screen and sees
 * what was concealed, then moves on with that screen's own Continue (a
 * `visit`). Every other interaction advances.
 *
 * Found in staging QA: the reveal advanced like everything else, so Six Names'
 * Evidence was recorded as revealed but never shown — "Open Evidence" went
 * straight to the next handoff. The server and Learner Preview both call this,
 * so they cannot disagree about it.
 */
export function screenAfterInteraction(
  interaction: MissionInteraction,
  current: MissionScreen,
  nextSequenceKey: string | null,
  state: MissionStateData,
): string | null {
  if (interaction.kind === "reveal") return current.screenKey;
  return resolveNextScreen(current, nextSequenceKey, state);
}

/**
 * Where does Continue Mission send the child?
 *
 * Architecture §13 / Tech Spec §28: return them to the appropriate state
 * without making them search. Falls back to the first screen.
 */
export function resolveResumeScreen(
  screens: MissionScreen[],
  currentScreenKey: string | null,
): string | null {
  const ordered = [...screens].sort((a, b) => a.sequence - b.sequence);
  if (
    currentScreenKey &&
    ordered.some((s) => s.screenKey === currentScreenKey)
  ) {
    return currentScreenKey;
  }
  return ordered[0]?.screenKey ?? null;
}

/** Is a reveal unlocked? Reveals persist once opened (Architecture §13). */
export function isRevealed(
  screen: MissionScreen,
  state: MissionStateData,
): boolean {
  if (state.revealed.includes(screen.screenKey)) return true;

  const config = parseScreenConfig("reveal", screen.configuration);
  switch (config.condition.type) {
    case "child_action":
      return false; // requires an explicit action
    case "choice_equals":
      return (
        state.choices[config.condition.screenKey] === config.condition.optionId
      );
    case "response_exists":
      return state.visitedScreens.includes(config.condition.screenKey);
  }
}

/**
 * Tech Spec §31 — completion is configured, never hard-coded per mission.
 */
export function isMissionComplete(
  rule: CompletionRule,
  state: MissionStateData,
  /** Defaults to the responses mirrored in state (see `respondedScreens`). */
  responseKeys: string[] = state.respondedScreens,
): boolean {
  switch (rule.type) {
    case "screen_reached":
      return state.visitedScreens.includes(rule.screenKey);
    case "conditions":
      return rule.conditions.every((condition) => {
        switch (condition.kind) {
          case "response_exists":
            return responseKeys.includes(condition.screenKey);
          case "choice_equals":
            return state.choices[condition.screenKey] === condition.optionId;
          case "choice_exists":
            // Any option counts — no branch is correct or incorrect.
            return Boolean(state.choices[condition.screenKey]);
          case "screen_visited":
            return state.visitedScreens.includes(condition.screenKey);
        }
      });
  }
}

/** Record a visit without duplicating entries. */
export function markVisited(
  state: MissionStateData,
  screenKey: string,
): MissionStateData {
  if (state.visitedScreens.includes(screenKey)) return state;
  return { ...state, visitedScreens: [...state.visitedScreens, screenKey] };
}

/** Append without duplicating. */
function withEntry(list: string[], entry: string): string[] {
  return list.includes(entry) ? list : [...list, entry];
}

/**
 * THE STATE REDUCER — pure, so every persistence guarantee below is testable
 * without a database.
 *
 * Generic by construction: it knows interaction *kinds*, never missions. There
 * is no place here for `if (mission === ...)`, and mission-specific state goes
 * through `custom` (Architecture §19: the shared architecture must not force
 * every mission into the same internal sequence).
 *
 * Every transition is additive. Nothing a child has done is ever removed:
 * Architecture §13 requires that established branches stay established and
 * revealed information stays revealed.
 */
export function applyInteraction(
  state: MissionStateData,
  interaction: MissionInteraction,
): MissionStateData {
  switch (interaction.kind) {
    case "visit":
      return markVisited(state, interaction.screenKey);

    case "choice":
      return {
        ...markVisited(state, interaction.screenKey),
        // Re-answering overwrites the choice but never erases the branch
        // history in visitedScreens.
        choices: {
          ...state.choices,
          [interaction.screenKey]: interaction.optionId,
        },
      };

    case "response":
      return {
        ...markVisited(state, interaction.screenKey),
        respondedScreens: withEntry(
          state.respondedScreens,
          interaction.screenKey,
        ),
      };

    case "reveal":
      return {
        ...markVisited(state, interaction.screenKey),
        revealed: withEntry(state.revealed, interaction.screenKey),
      };

    case "handoff":
      return {
        ...markVisited(state, interaction.screenKey),
        confirmedHandoffs: withEntry(
          state.confirmedHandoffs,
          interaction.screenKey,
        ),
      };

    case "multi_choice":
      return {
        ...markVisited(state, interaction.screenKey),
        // Recorded, never branching (Q2). Replaces any previous selection for
        // this screen; Decision 2 keeps its own entry, so the two decisions
        // may share concerns or differ.
        multiChoices: {
          ...state.multiChoices,
          [interaction.screenKey]: interaction.optionIds,
        },
      };

    case "tracker":
      return {
        ...markVisited(state, interaction.screenKey),
        // Mission-specific reflection state lives in `custom`, per
        // Architecture §19. Positions are indices into labelled scales —
        // nothing sums or compares them.
        custom: {
          ...state.custom,
          [interaction.screenKey]: interaction.positions,
        },
      };

    case "custom":
      return {
        ...state,
        custom: { ...state.custom, [interaction.key]: interaction.value },
      };
  }
}

export { emptyMissionState };

/**
 * Apply the canonical tracker state a screen declares.
 *
 * The Build Brief requires the Academy to persist the tracker state belonging
 * to the branch the child is on, and to set Clarity to "Purpose clear" when
 * Evidence is opened. That state is a property of the authored mission, so it
 * is read from the screen's own configuration, which only ever arrives through
 * the gated RPC. The browser is never asked for it and cannot influence it.
 *
 * Merged, not replaced: Evidence patches Clarity alone and must leave Spread
 * and Support exactly as the branch left them.
 *
 * Generic by construction — this knows that a screen MAY declare canonical
 * tracker state, never which mission is playing.
 *
 * LIVES HERE, NOT IN persistence.ts, because the admin Preview has to apply it
 * too. Preview runs the real engine with state in memory; if this stayed
 * private to the server-only module, a preview would show different tracker
 * values than the mission it is previewing — which is the one thing a preview
 * must not do. It is pure: no database, no session, no side effects.
 */
export function applyCanonicalTracker(
  state: MissionStateData,
  screen: MissionScreen,
): MissionStateData {
  const schema = screenConfigByType[screen.type];
  if (!schema) return state;

  const parsed = schema.safeParse(screen.configuration);
  if (!parsed.success) return state;

  const patch = (parsed.data as { canonicalTracker?: Record<string, string> })
    .canonicalTracker;
  if (!patch || Object.keys(patch).length === 0) return state;

  const existing =
    (state.custom.tracker as Record<string, string> | undefined) ?? {};

  return {
    ...state,
    custom: { ...state.custom, tracker: { ...existing, ...patch } },
  };
}
