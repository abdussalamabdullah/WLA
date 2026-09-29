"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MissionScreenRenderer } from "@/features/mission-engine/renderer";
import {
  applyCanonicalTracker,
  applyInteraction,
  screenAfterInteraction,
  isMissionComplete,
  type MissionScreen,
} from "@/features/mission-engine/navigation";
import {
  emptyMissionState,
  completionRule as completionRuleSchema,
  type MissionInteraction,
  type MissionStateData,
} from "@/features/mission-engine/schemas";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * LEARNER PREVIEW — brief §6.
 *
 * NOT A SECOND RENDERER. This drives `MissionScreenRenderer` — the same
 * component, the same registry, the same screen components a learner sees — and
 * advances with the same pure engine functions the server uses:
 * `applyInteraction`, `applyCanonicalTracker`, `screenAfterInteraction`,
 * `isMissionComplete`. A preview that re-implemented any of those would
 * eventually disagree with the mission it claims to preview, which is the only
 * way a preview can actively mislead.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   No progress row, no entitlement, no analytics event, no state written
 *   anywhere. Every one of those would be a real learner record created by an
 *   administrator looking at a draft. State lives in this component and dies
 *   with the page — which is also why Restart is free and why leaving loses
 *   nothing that mattered.
 *
 * The screens arrive from `admin_draft_screens`, which refuses unless the
 * caller is an admin AND the version is still a draft — so this cannot become
 * a way to read published mission content (D-61).
 */
export function MissionPreview({
  missionTitle,
  missionSlug,
  version,
  screens,
  completionRule,
  backHref,
}: {
  missionTitle: string;
  missionSlug: string;
  version: number;
  screens: MissionScreen[];
  completionRule: unknown;
  backHref: string;
}) {
  const ordered = useMemo(
    () => [...screens].sort((a, b) => a.sequence - b.sequence),
    [screens],
  );
  const byKey = useMemo(
    () => new Map(ordered.map((s) => [s.screenKey, s])),
    [ordered],
  );

  const [currentKey, setCurrentKey] = useState<string | null>(
    ordered[0]?.screenKey ?? null,
  );
  const [state, setState] = useState<MissionStateData>(emptyMissionState);
  const [visited, setVisited] = useState<string[]>(
    ordered[0] ? [ordered[0].screenKey] : [],
  );
  const [finished, setFinished] = useState(false);
  const [stuck, setStuck] = useState<string | null>(null);

  const rule = useMemo(() => {
    const parsed = completionRule
      ? completionRuleSchema.safeParse(completionRule)
      : null;
    return parsed?.success ? parsed.data : null;
  }, [completionRule]);

  const screen = currentKey ? (byKey.get(currentKey) ?? null) : null;

  function nextSequenceKeyFor(s: MissionScreen): string | null {
    const i = ordered.findIndex((x) => x.screenKey === s.screenKey);
    return i >= 0 && i + 1 < ordered.length ? ordered[i + 1].screenKey : null;
  }

  function advance(interaction: MissionInteraction) {
    if (!screen) return;
    setStuck(null);

    // Exactly the server's order: the reducer first, then the screen's own
    // canonical patch, so nothing the interaction carried can overwrite it.
    const nextState = applyCanonicalTracker(
      applyInteraction(state, interaction),
      screen,
    );
    setState(nextState);

    if (rule && isMissionComplete(rule, nextState)) {
      setFinished(true);
      return;
    }

    const nextKey = screenAfterInteraction(
      interaction,
      screen,
      nextSequenceKeyFor(screen),
      nextState,
    );
    if (!nextKey) {
      setStuck("Nothing follows this screen and the mission is not complete.");
      return;
    }
    if (!byKey.has(nextKey)) {
      setStuck(`This screen leads to "${nextKey}", which does not exist in this version.`);
      return;
    }
    setCurrentKey(nextKey);
    if (nextKey !== screen.screenKey) setVisited((v) => [...v, nextKey]);
  }

  function restart() {
    setState(emptyMissionState);
    setCurrentKey(ordered[0]?.screenKey ?? null);
    setVisited(ordered[0] ? [ordered[0].screenKey] : []);
    setFinished(false);
    setStuck(null);
  }

  return (
    <div className="min-h-dvh bg-[var(--color-background)]">
      {/* ------------------------------------------------- the preview frame */}
      <div className="sticky top-0 z-30 border-b border-[var(--color-border-strong)] bg-[var(--color-surface-sage)]">
        <div className="wla-container flex min-h-[56px] flex-wrap items-center justify-between gap-[var(--space-s)] py-[var(--space-xs)]">
          <p className="text-[length:var(--text-small)]">
            <strong>Preview</strong> · {missionTitle} v{version} · nothing here
            is saved
          </p>
          <div className="flex items-center gap-[var(--space-m)]">
            <button
              type="button"
              onClick={restart}
              className="min-h-[var(--target-min)] text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4"
            >
              Start again
            </button>
            <Link
              href={backHref}
              className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4"
            >
              Back to the builder
            </Link>
          </div>
        </div>
      </div>

      <main className="wla-container-narrow py-[var(--space-2xl)]">
        <h1 className="sr-only">
          Preview of {missionTitle}, version {version}
        </h1>

        {ordered.length === 0 ? (
          <p className="wla-measure text-[var(--color-text-muted)]">
            This version has no screens yet, so there is nothing to preview.
          </p>
        ) : finished ? (
          <div>
            <p className="text-[length:var(--text-h1)]">Mission complete</p>
            <p className="mt-[var(--space-m)] wla-measure text-[var(--color-text-muted)]">
              The completion rule was satisfied after {visited.length} screen
              {visited.length === 1 ? "" : "s"}. A learner would now see the
              completion screen and their Mission Trail.
            </p>
            <div className="mt-[var(--space-l)]">
              <Button type="button" onClick={restart}>Start again</Button>
            </div>
          </div>
        ) : stuck ? (
          <div>
            <p className="text-[length:var(--text-h3)]">The preview can&rsquo;t go further</p>
            <p className="mt-[var(--space-s)] wla-measure text-[var(--color-error)]">{stuck}</p>
            <p className="mt-[var(--space-m)] wla-measure text-[var(--color-text-muted)]">
              A learner would be stranded here. Fix it in the builder, then
              preview again.
            </p>
            <div className="mt-[var(--space-l)] flex gap-[var(--space-m)]">
              <Button type="button" onClick={restart}>Start again</Button>
              <Link
                href={backHref}
                className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
              >
                Back to the builder
              </Link>
            </div>
          </div>
        ) : screen ? (
          <>
            <MissionScreenRenderer
              key={screen.screenKey}
              screen={screen}
              state={state}
              missionSlug={missionSlug}
              onAdvance={advance}
              isPending={false}
            />
            <p
              className={cn(
                "mt-[var(--space-2xl)] border-t border-[var(--color-border)] pt-[var(--space-m)]",
                "text-[length:var(--text-small)] text-[var(--color-text-muted)]",
              )}
            >
              Screen {visited.length} of this path · <code>{screen.screenKey}</code> ·{" "}
              {screen.type.replace(/_/g, " ")}
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}
