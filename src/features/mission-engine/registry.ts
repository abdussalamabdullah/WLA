import type { ComponentType } from "react";
import type {
  ScreenType,
  MissionInteraction,
  MissionStateData,
} from "./schemas";
import type { MissionScreen } from "./navigation";

/**
 * SCREEN REGISTRY — Tech Spec §15:
 * "screen type determines which reusable UI component renders it."
 *
 * Adding a mission must never mean adding a file here. Adding a new *kind of
 * interaction* means one entry here plus its zod schema — and that is a
 * product decision, not a developer convenience.
 */

export type ScreenComponentProps = {
  screen: MissionScreen;
  state: MissionStateData;
  /**
   * Record an interaction and advance.
   *
   * Takes a MissionInteraction, not a state patch: screens describe what the
   * child DID, and the reducer decides what that means. A screen can therefore
   * never write arbitrary state.
   */
  onAdvance: (interaction: MissionInteraction) => void;
  isPending: boolean;
  /** D-18 — set when the last write failed. The mission has not advanced. */
  error?: string;
};

export type ScreenComponent = ComponentType<ScreenComponentProps>;

/**
 * Populated in `registry.runtime.ts`, which imports the client components.
 * Kept separate so server code can reason about screen types without pulling
 * React components into the server bundle.
 */
export const screenRegistry: Partial<Record<ScreenType, ScreenComponent>> = {};

export function registerScreens(
  entries: Partial<Record<ScreenType, ScreenComponent>>,
) {
  Object.assign(screenRegistry, entries);
}

export function getScreenComponent(type: ScreenType): ScreenComponent | null {
  return screenRegistry[type] ?? null;
}
