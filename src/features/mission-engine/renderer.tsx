import { createElement } from "react";
import { getScreenComponent, registerScreens } from "./registry";
import {
  ChoiceScreen,
  CompletionScreen,
  ContentScreen,
  HandoffScreen,
  MultiChoiceScreen,
  PrepareScreen,
  ResponseScreen,
  TrackerScreen,
} from "@/components/mission/screens";
import type { MissionScreen } from "./navigation";
import type { MissionInteraction, MissionStateData } from "./schemas";

/**
 * The screen-type → component map.
 *
 * Every entry is a TYPE of interaction. None is a mission. `reveal` has no
 * component yet because no approved mission uses in-screen concealment —
 * Six Names stages information by sequence position instead, enforced in the
 * database (the screen_access migration).
 */
registerScreens({
  content: ContentScreen,
  prepare: PrepareScreen,
  choice: ChoiceScreen,
  multi_choice: MultiChoiceScreen,
  tracker: TrackerScreen,
  response: ResponseScreen,
  handoff: HandoffScreen,
  completion: CompletionScreen,
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
  onAdvance,
  isPending = false,
  error,
}: {
  screen: MissionScreen;
  state: MissionStateData;
  onAdvance: (interaction: MissionInteraction) => void;
  isPending?: boolean;
  error?: string;
}) {
  const component = getScreenComponent(screen.type);
  if (!component) return null;

  return createElement(component, {
    screen,
    state,
    onAdvance,
    isPending,
    error,
  });
}

/** Can this screen be rendered yet? Lets callers choose their fallback. */
export function canRenderScreen(screen: MissionScreen | null): boolean {
  return screen !== null && getScreenComponent(screen.type) !== null;
}
