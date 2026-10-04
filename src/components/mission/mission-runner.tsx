"use client";

import { useState, useTransition } from "react";
import { MissionScreenRenderer } from "@/features/mission-engine/renderer";
import { recordInteractionAction, recordMissionEventAction } from "@/features/mission-engine/actions";
import { MissionContextProvider, type MissionContextValue } from "./mission-context";
import type { MissionScreen } from "@/features/mission-engine/navigation";
import type {
  MissionInteraction,
  MissionStateData,
} from "@/features/mission-engine/schemas";

/**
 * Drives one mission screen.
 *
 * D-18 — interaction → persist → success → advance. This component never
 * advances optimistically: the server decides the next position and the page
 * re-renders from it. On failure the child stays exactly where they are and
 * the screen offers a retry.
 *
 * It holds no mission state of its own. `state` arrives from the server on
 * every render, which is what makes refresh and leave-and-return the same
 * path.
 */
export function MissionRunner({
  missionSlug,
  screen,
  state,
}: {
  missionSlug: string;
  screen: MissionScreen;
  state: MissionStateData;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function advance(interaction: MissionInteraction) {
    setError(undefined);
    startTransition(async () => {
      const outcome = await recordInteractionAction(missionSlug, interaction);
      if (!outcome.ok) {
        // Nothing moved. The screen stays mounted with its input intact.
        setError(outcome.message);
      }
    });
  }

  /*
   * Central client analytics (F5): shared components call `report`, this
   * provider sends it once through the allow-listed server action. The run is
   * identified on the server, never here (D-76).
   */
  const context: MissionContextValue = {
    missionSlug,
    mode: "learner",
    support: [],
    report: (name, detail) => {
      void recordMissionEventAction(missionSlug, name, detail);
    },
  };

  return (
    <MissionContextProvider value={context}>
    <MissionScreenRenderer
      key={screen.screenKey}
      screen={screen}
      state={state}
      missionSlug={missionSlug}
      onAdvance={advance}
      isPending={isPending}
      error={error}
    />
    </MissionContextProvider>
  );
}
