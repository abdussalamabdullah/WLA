"use client";

import { createElement } from "react";
import {
  MissionContextProvider,
  useMissionContext,
  type SupportItem,
} from "@/components/mission/mission-context";
import { getScreenComponent, registerScreens } from "./registry";
import {
  ChoiceScreen,
  CompletionScreen,
  ContentScreen,
  HandoffScreen,
  MultiChoiceScreen,
  PrepareScreen,
  ReflectionScreen,
  ResponseScreen,
  RevealScreen,
  SortItemsScreen,
  TrackerConfirmationScreen,
  TrackerScreen,
} from "@/components/mission/screens";
import {
  AllocateScreen,
  ArrangeScreen,
  CodeEntryScreen,
  CompareScreen,
  HotspotScreen,
  InventoryScreen,
  MapScreen,
  MatchingScreen,
  NumericEntryScreen,
  PatternGridScreen,
  SimulationScreen,
  SketchScreen,
  TokenSequenceScreen,
  WorkspaceScreen,
} from "@/components/mission/screens/library";
import type { MissionScreen } from "./navigation";
import type { MediaBlock } from "./media";
import type { MissionInteraction, MissionStateData } from "./schemas";

/**
 * The screen-type → component map.
 *
 * Every entry is a TYPE of interaction. None is a mission.
 */
registerScreens({
  content: ContentScreen,
  prepare: PrepareScreen,
  choice: ChoiceScreen,
  multi_choice: MultiChoiceScreen,
  tracker: TrackerScreen,
  sort_items: SortItemsScreen,
  tracker_confirmation: TrackerConfirmationScreen,
  reflection: ReflectionScreen,
  response: ResponseScreen,
  reveal: RevealScreen,
  handoff: HandoffScreen,
  completion: CompletionScreen,
  // The interaction library (D-86).
  numeric_entry: NumericEntryScreen,
  code_entry: CodeEntryScreen,
  token_sequence: TokenSequenceScreen,
  arrange: ArrangeScreen,
  matching: MatchingScreen,
  allocate: AllocateScreen,
  inventory: InventoryScreen,
  compare: CompareScreen,
  hotspot: HotspotScreen,
  sketch: SketchScreen,
  map: MapScreen,
  pattern_grid: PatternGridScreen,
  simulation: SimulationScreen,
  workspace: WorkspaceScreen,
});

/**
 * THE MISSION RENDERER — Tech Spec §17.
 *
 *   get current screen → identify screen type → render component
 *
 * This is the single point of dynamic dispatch in the whole application, and
 * the reason a new mission needs no new code: `screen_type` selects the
 * component, and everything else is configuration.
 *
 * `createElement` rather than JSX because the component is resolved at
 * runtime from the registry — expressing that directly keeps the dispatch
 * legible instead of hiding it behind a capitalised local variable.
 *
 * Returns null when no renderer is registered for a type. The registry is
 * empty until a Mission Build Brief is approved (docs/DECISIONS.md → OPEN-03),
 * so callers must handle null rather than assume a screen will render.
 */
export function MissionScreenRenderer({
  screen,
  state,
  missionSlug,
  onAdvance,
  isPending = false,
  error,
}: {
  screen: MissionScreen;
  state: MissionStateData;
  missionSlug: string;
  onAdvance: (interaction: MissionInteraction) => void;
  isPending?: boolean;
  error?: string;
}) {
  const outer = useMissionContext();
  const component = getScreenComponent(screen.type);
  if (!component) return null;

  // Mission Control v2 items for THIS screen (already filtered by the
  // server's projection), made available to every shared component.
  const support = ((screen.configuration as { support?: SupportItem[] } | null)?.support ?? []);
  // F7 — resolved media only (an unresolved block still names a key, not an asset).
  const media = ((screen.configuration as { media?: unknown[] } | null)?.media ?? []).filter(
    (b): b is MediaBlock => !!b && typeof (b as { asset?: unknown }).asset === "object",
  );

  return createElement(
    MissionContextProvider,
    { value: { ...outer, missionSlug, support, media } },
    createElement(component, {
      screen,
      state,
      missionSlug,
      onAdvance,
      isPending,
      error,
    }),
  );
}

/** Can this screen be rendered yet? Lets callers choose their fallback. */
export function canRenderScreen(screen: MissionScreen | null): boolean {
  return screen !== null && getScreenComponent(screen.type) !== null;
}
