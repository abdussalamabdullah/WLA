"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startMissionAction } from "@/features/mission-engine/actions";

/**
 * Architecture §5/§6 — the strongest action on Mission Home.
 *
 * A form-backed mutation rather than a link, so progress is never created by
 * navigation or link prefetch.
 */
export function StartMissionButton({
  missionSlug,
  label,
}: {
  missionSlug: string;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={() => {
        startTransition(() => {
          void startMissionAction(missionSlug);
        });
      }}
    >
      <Button
        type="submit"
        size="large"
        isLoading={isPending}
        // UI/UX §49 — preserve button dimensions, no layout jump.
        loadingLabel="Starting mission…"
      >
        {label}
      </Button>
    </form>
  );
}
