"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { PrimaryAction, ScreenFrame, SelectableOption } from "./shared";
import {
  isRevealed,
  parseScreenConfig,
  type ScreenComponentProps,
} from "@/features/mission-engine";
import { cn } from "@/lib/utils";

/**
 * MISSION SCREEN COMPONENTS
 *
 * One per screen type. Each is GENERIC — none knows what mission it is
 * rendering. All copy, options, labels and support content arrive as
 * configuration, so a content revision never touches this file (C9-6).
 */

/** Instruction or staged information, with a single continue action. */
export function ContentScreen({
  screen,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("content", screen.configuration);
  return (
    <ScreenFrame
      title={screen.title}
      body={screen.body}
      instruction={config.instruction}
      missionControl={config.missionControl}
      error={error}
      action={
        <PrimaryAction
          label={config.actionLabel ?? "Continue"}
          isPending={isPending}
          onClick={() =>
            onAdvance({ kind: "visit", screenKey: screen.screenKey })
          }
        />
      }
    />
  );
}

/**
 * Architecture §10 — preparation. Orients without repeating the Child Mission.
 */
export function PrepareScreen({
  screen,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("prepare", screen.configuration);
  return (
    <ScreenFrame
      title={screen.title}
      body={screen.body}
      missionControl={config.missionControl}
      error={error}
      action={
        <PrimaryAction
          label={config.readyLabel}
          isPending={isPending}
          onClick={() =>
            onAdvance({ kind: "handoff", screenKey: screen.screenKey })
          }
        />
      }
    >
      <div className="wla-measure flex flex-col gap-[var(--space-l)]">
        <section>
          <h2 className="text-[length:var(--text-h3)]">What you need</h2>
          <ul className="mt-[var(--space-s)] flex flex-col gap-[var(--space-xs)]">
            {config.materials.map((item) => (
              <li key={item} className="flex gap-[var(--space-s)]">
                <span aria-hidden>·</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {config.cautions.length > 0 && (
          <section>
            {config.cautions.map((caution) => (
              <p key={caution} className="font-medium">
                {caution}
              </p>
            ))}
          </section>
        )}
      </div>
    </ScreenFrame>
  );
}

/** A decision. The selected option determines what happens next (Q2). */
export function ChoiceScreen({
  screen,
  state,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("choice", screen.configuration);
  const saved = state.choices[screen.screenKey];
  const [selected, setSelected] = useState<string | null>(saved ?? null);
  const locked = config.locksOnConfirm && Boolean(saved);

  return (
    <ScreenFrame
      title={screen.title}
      body={screen.body}
      instruction={config.instruction}
      missionControl={config.missionControl}
      error={error}
      action={
        <PrimaryAction
          label="Confirm"
          disabled={!selected || locked}
          isPending={isPending}
          onClick={() =>
            selected &&
            onAdvance({
              kind: "choice",
              screenKey: screen.screenKey,
              optionId: selected,
            })
          }
        />
      }
    >
      <fieldset className="wla-measure flex flex-col gap-[var(--space-s)]">
        <legend className="mb-[var(--space-m)] font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">
          {config.prompt}
        </legend>
        {config.options.map((option) => (
          <SelectableOption
            key={option.id}
            label={option.label}
            selected={selected === option.id}
            disabled={locked}
            onSelect={() => setSelected(option.id)}
          />
        ))}
      </fieldset>
    </ScreenFrame>
  );
}

/**
 * Select exactly N. Recorded, never branching (Q2) — this captures what
 * matters to the child, not what they decide to do.
 */
export function MultiChoiceScreen({
  screen,
  state,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("multi_choice", screen.configuration);
  const saved = state.multiChoices[screen.screenKey] ?? [];
  const [selected, setSelected] = useState<string[]>(saved);

  const target = config.selectExactly;
  const complete = selected.length === target;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length >= target
          ? current
          : [...current, id],
    );
  }

  return (
    <ScreenFrame
      title={screen.title}
      body={screen.body}
      instruction={config.instruction}
      missionControl={config.missionControl}
      error={error}
      action={
        <PrimaryAction
          label="Confirm"
          disabled={!complete}
          isPending={isPending}
          onClick={() =>
            onAdvance({
              kind: "multi_choice",
              screenKey: screen.screenKey,
              optionIds: selected,
            })
          }
        />
      }
    >
      <fieldset className="wla-measure flex flex-col gap-[var(--space-s)]">
        <legend className="mb-[var(--space-m)] font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">
          {config.prompt}
        </legend>

        {config.options.map((option) => (
          <SelectableOption
            key={option.id}
            label={option.label}
            selected={selected.includes(option.id)}
            disabled={
              !selected.includes(option.id) && selected.length >= target
            }
            onSelect={() => toggle(option.id)}
          />
        ))}

        {/* Count in text, never a colour cue (Architecture §20) */}
        <p
          aria-live="polite"
          className="text-[length:var(--text-small)] text-[var(--color-text-muted)]"
        >
          {selected.length} of {target} chosen
        </p>
      </fieldset>
    </ScreenFrame>
  );
}

/**
 * Labelled positional scales. Reflection, not a score — nothing is summed,
 * compared or evaluated (Architecture §14, Brief §26).
 */
export function TrackerScreen({
  screen,
  state,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("tracker", screen.configuration);
  const saved = (state.custom[screen.screenKey] ?? {}) as Record<
    string,
    number
  >;
  const [positions, setPositions] = useState<Record<string, number>>(saved);

  const complete =
    !config.required ||
    config.dimensions.every((d) => positions[d.id] !== undefined);

  return (
    <ScreenFrame
      title={screen.title}
      body={screen.body}
      instruction={config.instruction}
      missionControl={config.missionControl}
      error={error}
      action={
        <PrimaryAction
          label="Continue"
          disabled={!complete}
          isPending={isPending}
          onClick={() =>
            onAdvance({
              kind: "tracker",
              screenKey: screen.screenKey,
              positions,
            })
          }
        />
      }
    >
      <div className="flex flex-col gap-[var(--space-xl)]">
        <p className="wla-measure font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">
          {config.prompt}
        </p>

        {config.dimensions.map((dimension) => (
          <fieldset key={dimension.id}>
            {/* The dimension name is content, not a label. Set as such. */}
            <legend className="text-[length:var(--text-label)] font-semibold">
              {dimension.label}
            </legend>
            {/* Single column on phone — §58 forbids dense rows of tiny controls */}
            <div className="mt-[var(--space-s)] flex flex-col gap-[var(--space-s)] sm:flex-row">
              {dimension.positions.map((label, index) => {
                const chosen = positions[dimension.id] === index;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() =>
                      setPositions((p) => ({ ...p, [dimension.id]: index }))
                    }
                    className={cn(
                      "min-h-[var(--target-min)] flex-1 rounded-[var(--radius-card)] border",
                      "px-[var(--space-m)] text-[length:var(--text-small)]",
                      "transition-colors duration-[var(--duration-fast)]",
                      chosen
                        ? "border-[var(--color-primary)] bg-[var(--color-surface-sage)] font-medium"
                        : "border-[var(--color-border)] bg-[var(--color-surface)]",
                    )}
                  >
                    {label}
                    {chosen && <span className="sr-only"> — chosen</span>}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
    </ScreenFrame>
  );
}

/**
 * A written response. One field (Q1) — `promptLines` shape the reflection
 * without demanding a separate answer to each.
 */
export function ResponseScreen({
  screen,
  state,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("response", screen.configuration);
  const [value, setValue] = useState("");
  const answered = state.respondedScreens.includes(screen.screenKey);
  const ready = !config.required || value.trim().length > 0;

  return (
    <ScreenFrame
      title={screen.title}
      body={screen.body}
      instruction={config.instruction}
      missionControl={config.missionControl}
      error={error}
      action={
        <PrimaryAction
          label="Save and continue"
          disabled={!ready}
          isPending={isPending}
          onClick={() =>
            onAdvance({
              kind: "response",
              screenKey: screen.screenKey,
              value: value.trim(),
            })
          }
        />
      }
    >
      <div className="wla-measure">
        {config.promptLines.length > 0 && (
          <ul className="mb-[var(--space-m)] flex flex-col gap-[var(--space-xs)] font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">
            {config.promptLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        <Field label={config.prompt} htmlFor={`response-${screen.screenKey}`}>
          {config.inputType === "long_text" ? (
            <textarea
              id={`response-${screen.screenKey}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={config.maxLength}
              rows={4}
              placeholder={config.placeholder}
              className="w-full rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-m)]"
            />
          ) : (
            <Input
              id={`response-${screen.screenKey}`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={config.maxLength}
              placeholder={config.placeholder}
            />
          )}
        </Field>

        {answered && (
          <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            You&rsquo;ve already answered this. Writing again replaces it.
          </p>
        )}
      </div>
    </ScreenFrame>
  );
}

/**
 * ENGINE-04 — conditional reveal.
 *
 * Content stays concealed until the mission's configured condition is met
 * (Brief §21). The three conditions are evaluated by `isRevealed`:
 *   child_action    — the child asks
 *   choice_equals   — an earlier choice unlocks it
 *   response_exists — an earlier answer unlocks it
 *
 * Once revealed it stays revealed (Architecture §13), so returning later shows
 * the content without asking again.
 *
 * NOTE: the concealed body is sent to the browser, so this is presentational
 * concealment within a screen the child has already reached. It is NOT the
 * mechanism that protects staged information across screens — that is the
 * screen_access migration, which never sends a future screen at all. A mission
 * whose secret must be cryptographically withheld should stage it as a
 * separate screen, as Six Names does.
 */
export function RevealScreen({ screen, state, onAdvance, isPending, error }: ScreenComponentProps) {
  const config = parseScreenConfig("reveal", screen.configuration);
  const revealed = isRevealed(screen, state);

  return (
    <ScreenFrame
      title={screen.title}
      body={screen.body}
      missionControl={config.missionControl}
      error={error}
      action={
        revealed ? (
          <PrimaryAction
            label="Continue"
            isPending={isPending}
            onClick={() => onAdvance({ kind: "visit", screenKey: screen.screenKey })}
          />
        ) : (
          <PrimaryAction
            label={config.revealLabel}
            isPending={isPending}
            onClick={() => onAdvance({ kind: "reveal", screenKey: screen.screenKey })}
          />
        )
      }
    >
      <div className="wla-measure">
        {revealed ? (
          <>
            {config.revealedTitle && (
              <h2 className="text-[length:var(--text-h3)]">{config.revealedTitle}</h2>
            )}
            {/* Announced, so the change is not conveyed visually alone (§62) */}
            <div aria-live="polite" className="mt-[var(--space-s)] flex flex-col gap-[var(--space-m)]">
              {config.revealedBody.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </>
        ) : (
          <p className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">
            {config.concealedPrompt}
          </p>
        )}
      </div>
    </ScreenFrame>
  );
}

/** Mid-mission physical handoff — where do I go, what do I do, when do I return. */
export function HandoffScreen({
  screen,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("handoff", screen.configuration);
  return (
    <ScreenFrame
      title={screen.title}
      body={screen.body}
      missionControl={config.missionControl}
      error={error}
      action={
        <PrimaryAction
          label={config.returnLabel}
          isPending={isPending}
          onClick={() =>
            onAdvance({ kind: "handoff", screenKey: screen.screenKey })
          }
        />
      }
    >
      <div className="wla-measure flex flex-col gap-[var(--space-m)]">
        <p className="font-medium">{config.location}</p>
        <ol className="flex list-decimal flex-col gap-[var(--space-s)] pl-[var(--space-l)]">
          {config.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p>{config.returnInstruction}</p>
      </div>
    </ScreenFrame>
  );
}

/** The last screen. Completion itself is evaluated server-side. */
export function CompletionScreen({
  screen,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("completion", screen.configuration);
  return (
    <ScreenFrame
      title={screen.title}
      body={config.message}
      missionControl={[]}
      error={error}
      action={
        <PrimaryAction
          label="Finish"
          isPending={isPending}
          onClick={() =>
            onAdvance({ kind: "visit", screenKey: screen.screenKey })
          }
        />
      }
    />
  );
}
