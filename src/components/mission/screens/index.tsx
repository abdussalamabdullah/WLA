"use client";

import { useState } from "react";
import { clearDrafts, useDraft } from "./draft";
import { Field, Input } from "@/components/ui/field";
import { PrimaryAction, ScreenFrame, SelectableOption } from "./shared";
import {
  ListObject,
  PauseMissionLink,
  ReflectionPrompts,
} from "./six-names-types";

export {
  SortItemsScreen,
  TrackerConfirmationScreen,
  ReflectionScreen,
} from "./six-names-types";
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
  missionSlug,
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
        <>
          <PrimaryAction
            label={config.actionLabel ?? "Continue"}
            isPending={isPending}
            onClick={() =>
              onAdvance({ kind: "visit", screenKey: screen.screenKey })
            }
          />
          {/*
            "Pause Mission" leaves; it does not advance. Nothing is written,
            because the child's position was persisted when they arrived here
            — which is why pausing cannot fail and needs no confirmation.
          */}
          {config.secondaryAction && (
            <PauseMissionLink
              missionSlug={missionSlug}
              label={config.secondaryAction}
            />
          )}
        </>
      }
    >
      <ListObject items={config.listObject} label={config.listLabel} />
      <ReflectionPrompts prompts={config.reflectionPrompts} />
    </ScreenFrame>
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
          label={config.confirmLabel ?? "Confirm"}
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
            description={option.description}
            selected={selected === option.id}
            disabled={locked}
            onSelect={() => setSelected(option.id)}
          />
        ))}
      </fieldset>

      {/*
        Appears only once a response is chosen, and only before it is
        confirmed — which is the whole point: the prediction is made against
        the physical tracker while the outcome is still unknown.

        A note, never a field. Nothing here can be submitted or stored.
      */}
      {config.confirmNote && selected && (
        <p
          aria-live="polite"
          className="wla-measure rounded-[var(--radius-surface)] bg-[var(--color-surface-sage)] p-[var(--space-l)]"
        >
          {config.confirmNote}
        </p>
      )}
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
  missionSlug,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("multi_choice", screen.configuration);
  const saved = state.multiChoices[screen.screenKey] ?? [];
  // A partial selection survives an accidental reload (D-100); the saved
  // server choice remains the starting point.
  const [selected, setSelected] = useDraft<string[]>({ missionSlug, screen }, "selected", saved);

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
          onClick={() => {
            clearDrafts({ missionSlug, screen });
            onAdvance({
              kind: "multi_choice",
              screenKey: screen.screenKey,
              optionIds: selected,
            });
          }}
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
  missionSlug,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("tracker", screen.configuration);
  const saved = (state.custom[screen.screenKey] ?? {}) as Record<
    string,
    number
  >;
  const [positions, setPositions] = useDraft<Record<string, number>>({ missionSlug, screen }, "positions", saved);

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
          onClick={() => {
            clearDrafts({ missionSlug, screen });
            onAdvance({
              kind: "tracker",
              screenKey: screen.screenKey,
              positions,
            });
          }}
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
  missionSlug,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("response", screen.configuration);
  const [value, setValue] = useDraft({ missionSlug, screen }, "value", "");
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
          onClick={() => {
            clearDrafts({ missionSlug, screen });
            onAdvance({
              kind: "response",
              screenKey: screen.screenKey,
              value: value.trim(),
            });
          }}
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
export function RevealScreen({
  screen,
  state,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("reveal", screen.configuration);
  // The server decides (projection.ts, D-81): the browser no longer receives
  // the reveal's condition or, until it opens, its content.
  const revealed = screen.view?.revealed ?? isRevealed(screen, state);

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
            onClick={() =>
              onAdvance({ kind: "visit", screenKey: screen.screenKey })
            }
          />
        ) : (
          <PrimaryAction
            label={config.revealLabel}
            isPending={isPending}
            onClick={() =>
              onAdvance({ kind: "reveal", screenKey: screen.screenKey })
            }
          />
        )
      }
    >
      <div className="wla-measure">
        {revealed ? (
          <>
            {config.revealedTitle && (
              <h2 className="text-[length:var(--text-h3)]">
                {config.revealedTitle}
              </h2>
            )}
            {/* Announced, so the change is not conveyed visually alone (§62) */}
            <div
              aria-live="polite"
              className="mt-[var(--space-s)] flex flex-col gap-[var(--space-m)]"
            >
              {config.revealedBody.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            {/*
              Questions to sit with, not questions to answer. No field appears
              here and nothing is stored — the Brief is explicit that Evidence
              must not collect a written response.
            */}
            {config.reflectionPrompts.length > 0 && (
              <div className="mt-[var(--space-l)]">
                <ReflectionPrompts prompts={config.reflectionPrompts} />
              </div>
            )}
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
      {/*
        A HANDOFF LOOKS DIFFERENT FROM A SCREEN.

        The Build Brief requires handoff states to be visually distinct from
        the numbered Academy screens at every size, because they mean something
        different: put the screen down and go and do something. So the whole
        block sits on sage rather than the cream canvas, which is the one
        surface change the design language reserves for a change of register.
      */}
      <div className="wla-measure rounded-[var(--radius-surface)] bg-[var(--color-surface-sage)] p-[var(--space-l)]">
        <p className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">
          {config.location}
        </p>
        <ol className="mt-[var(--space-m)] flex list-decimal flex-col gap-[var(--space-s)] pl-[var(--space-l)]">
          {config.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-[var(--space-m)] text-[var(--color-text-muted)]">
          {config.returnInstruction}
        </p>
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
