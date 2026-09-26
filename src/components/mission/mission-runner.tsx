"use client";

import { useState, useTransition } from "react";
import { MissionScreenRenderer } from "@/features/mission-engine/renderer";
import { recordInteractionAction } from "@/features/mission-engine/actions";
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

  return (
    <MissionScreenRenderer
      key={screen.screenKey}
      screen={screen}
      state={state}
      onAdvance={advance}
      isPending={isPending}
      error={error}
    />
  );
}
