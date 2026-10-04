"use client";

import { resolveMedia, type ResolvedAsset } from "@/features/mission-engine/media";
import { MissionContextProvider } from "@/components/mission/mission-context";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { MissionScreenRenderer } from "@/features/mission-engine/renderer";
import type { MissionScreen } from "@/features/mission-engine/navigation";
import {
  emptyMissionState,
  parseMissionState,
  type MissionInteraction,
  type MissionStateData,
} from "@/features/mission-engine/schemas";
import { buildModel } from "@/features/mission-engine/definition";
import { startRun, step } from "@/features/mission-engine/runtime";
import { clientState, projectScreen } from "@/features/mission-engine/projection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * LEARNER PREVIEW — brief §6.
 *
 * NOT A SECOND RENDERER, NOT A SECOND ENGINE. This drives
 * `MissionScreenRenderer` — the same components a learner sees — with the
 * same runtime the server runs: `startRun` and `step` (runtime.ts), rendering
 * `projectScreen` (projection.ts), which is exactly what a child's browser
 * receives. A preview that re-implemented any of that would eventually
 * disagree with the mission it claims to preview.
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
  definition,
  backHref,
  assets = [],
}: {
  missionTitle: string;
  missionSlug: string;
  version: number;
  screens: MissionScreen[];
  completionRule: unknown;
  /** The draft's mission-level definition (F8), read through admin_draft_definition. */
  definition?: unknown;
  backHref: string;
  /** F7 — the draft's media, signed with the admin's session; resolved exactly as for a learner. */
  assets?: ResolvedAsset[];
}) {
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.key, a])), [assets]);
  const model = useMemo(
    () => buildModel({ definition, screens, completionRule }),
    [definition, screens, completionRule],
  );
  const ordered = model.screens;

  /** A fresh run, exactly as startVia initialises one — seed and all. */
  const fresh = useCallback(() => {
    const first = ordered[0]?.screenKey ?? null;
    const seed = Math.floor(Math.random() * 0x7fffffff);
    return startRun(model, emptyMissionState, first, new Date(), seed).state;
  }, [model, ordered]);

  const [currentKey, setCurrentKey] = useState<string | null>(ordered[0]?.screenKey ?? null);
  const [state, setState] = useState<MissionStateData>(() => fresh());
  const [visited, setVisited] = useState<string[]>(ordered[0] ? [ordered[0].screenKey] : []);
  const [finished, setFinished] = useState(false);
  const [stuck, setStuck] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  // Responses saved in this preview run, for recall ({{response.x}}) — as engine_load_run supplies them for a learner.
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [device, setDevice] = useState<"phone" | "tablet" | "desktop">("desktop");
  const [jumpKey, setJumpKey] = useState<string>(ordered[0]?.screenKey ?? "");
  const [stateText, setStateText] = useState<string>("");
  const [stateError, setStateError] = useState<string | null>(null);

  const screen = currentKey ? (model.screens.find((s) => s.screenKey === currentKey) ?? null) : null;
  // Render what a child would receive — the projection — not the raw model.
  const projected = screen ? resolveMedia(projectScreen(model, screen, state, new Date(), { responses }), assetMap) : null;
  const childState = clientState(model, state);

  function advance(interaction: MissionInteraction) {
    if (!screen) return;
    setStuck(null);
    setFailure(null);
    let result;
    try {
      // The server's own transition (runtime.ts) — not a copy of it.
      result = step(model, state, screen.screenKey, interaction, new Date());
    } catch (e) {
      setStuck(e instanceof Error ? `Refused: ${e.message}` : "Refused.");
      return;
    }
    if (!result.ok) {
      setState(result.state);
      setFailure(result.failure.message);
      return;
    }
    setState(result.state);
    const saved = result.response;
    if (saved) setResponses((r) => ({ ...r, [saved.key]: saved.value }));
    if (interaction.kind === "retry") setEpoch((n) => n + 1);
    if (result.completed) {
      setFinished(true);
      return;
    }
    const nextKey = result.nextScreenKey;
    if (!nextKey) {
      setStuck("Nothing follows this screen and the mission is not complete.");
      return;
    }
    if (!model.screens.some((s) => s.screenKey === nextKey)) {
      setStuck(`This screen leads to "${nextKey}", which does not exist in this version.`);
      return;
    }
    setCurrentKey(nextKey);
    if (nextKey !== screen.screenKey) setVisited((v) => [...v, nextKey]);
  }

  /**
   * Direct-state testing: start the preview at any screen, with any state the
   * author writes (variables, choices, unlocks…). Admin-only and in memory —
   * no learner record is touched.
   */
  function jump() {
    let next = state;
    if (stateText.trim()) {
      try {
        next = parseMissionState({ ...state, ...JSON.parse(stateText) });
        setStateError(null);
      } catch {
        setStateError("That state isn't valid JSON.");
        return;
      }
    }
    setState(next);
    setCurrentKey(jumpKey);
    setVisited((v) => [...v, jumpKey]);
    setFinished(false);
    setStuck(null);
    setFailure(null);
  }

  function restart() {
    setState(fresh());
    setResponses({});
    setCurrentKey(ordered[0]?.screenKey ?? null);
    setVisited(ordered[0] ? [ordered[0].screenKey] : []);
    setFinished(false);
    setStuck(null);
    setFailure(null);
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
          <div className="flex flex-wrap items-center gap-[var(--space-m)]">
            <label className="inline-flex min-h-[var(--target-min)] items-center gap-[var(--space-xs)] text-[length:var(--text-small)]">
              Device
              <select
                value={device}
                onChange={(e) => setDevice(e.target.value as typeof device)}
                className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-xs)]"
              >
                <option value="phone">Phone (390)</option>
                <option value="tablet">Tablet (834)</option>
                <option value="desktop">Desktop</option>
              </select>
            </label>
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

      <main
        className={cn(
          "py-[var(--space-2xl)]",
          device === "desktop" ? "wla-container-narrow" : "mx-auto my-[var(--space-l)] overflow-hidden rounded-[24px] border-4 border-[var(--color-border-strong)] bg-[var(--color-background)] px-[16px]",
        )}
        style={device === "phone" ? { width: 390, maxWidth: "100%" } : device === "tablet" ? { width: 834, maxWidth: "100%" } : undefined}
      >
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
            <MissionContextProvider value={{ missionSlug, mode: "preview", support: [], report: () => {}, notice: failure ?? undefined }}>
            <MissionScreenRenderer
              key={`${screen.screenKey}:${epoch}`}
              screen={projected ?? screen}
              state={childState}
              missionSlug={missionSlug}
              onAdvance={advance}
              isPending={false}
            />
            </MissionContextProvider>
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

      {/* ------------------------------------- authoring tools (admin only) */}
      <aside aria-labelledby="preview-tools" className="wla-container py-[var(--space-l)]">
        <h2 id="preview-tools" className="text-[length:var(--text-h3)]">Preview tools</h2>
        <details className="mt-[var(--space-s)]">
          <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center font-medium">State inspector</summary>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Everything the run holds — including hidden variables and the variant, which a child&rsquo;s browser never receives.
          </p>
          <pre className="mt-[var(--space-s)] max-h-[24rem] overflow-auto rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] text-[length:var(--text-small)]">
            {JSON.stringify({ screen: currentKey, variant: state.variant, variables: state.variables, unlocked: state.unlocked, events: state.firedEvents, choices: state.choices, revealed: state.revealed, attempts: state.attempts, marks: state.marks }, null, 2)}
          </pre>
        </details>
        <details className="mt-[var(--space-s)]">
          <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center font-medium">Jump to a screen with a given state</summary>
          <div className="mt-[var(--space-s)] grid gap-[var(--space-s)] sm:max-w-[40rem]">
            <label className="flex flex-col gap-[4px] text-[length:var(--text-small)]">
              Screen
              <select value={jumpKey} onChange={(e) => setJumpKey(e.target.value)} className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-xs)]">
                {ordered.map((x) => <option key={x.screenKey} value={x.screenKey}>{x.title || x.screenKey} ({x.screenKey})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-[4px] text-[length:var(--text-small)]">
              State to apply (optional), e.g. {"{"}&quot;variables&quot;: {"{"}&quot;fuel&quot;: 2{"}"}, &quot;unlocked&quot;: [&quot;door&quot;]{"}"}
              <textarea rows={4} spellCheck={false} value={stateText} onChange={(e) => setStateText(e.target.value)} className="rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] font-mono" />
            </label>
            {stateError && <p className="text-[length:var(--text-small)] text-[var(--color-error)]">{stateError}</p>}
            <div><Button type="button" variant="secondary" onClick={jump}>Jump</Button></div>
          </div>
        </details>
      </aside>
    </div>
  );
}
