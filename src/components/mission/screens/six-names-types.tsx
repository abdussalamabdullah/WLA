"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PrimaryAction, ScreenFrame, SelectableOption } from "./shared";
import {
  parseScreenConfig,
  type ScreenComponentProps,
} from "@/features/mission-engine";
import { cn } from "@/lib/utils";

/**
 * SCREEN TYPES ADDED FOR THE SIX NAMES ACADEMY BUILD BRIEF
 *
 * Each is GENERIC. None knows what mission it is rendering: every item,
 * category, label, prompt and canonical value arrives as configuration, so a
 * content revision never touches this file.
 *
 * They live beside the original nine rather than inside index.tsx only because
 * that file was already long; they are registered identically.
 */

/** Fisher–Yates. Pure with respect to its argument; the caller owns the timing. */
function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Read-and-reflect prompts.
 *
 * Shared by three screen types because the Build Brief uses the same shape in
 * all of them — "What does this evidence explain? What does it not undo?" —
 * and in every case is explicit that no field appears and nothing is stored.
 *
 * Rendered as a plain list of questions. There is no form element here at all,
 * which is the strongest available guarantee that nothing can be submitted.
 */
export function ReflectionPrompts({ prompts }: { prompts: string[] }) {
  if (prompts.length === 0) return null;
  return (
    <ul className="wla-measure flex flex-col gap-[var(--space-m)]">
      {prompts.map((prompt) => (
        <li
          key={prompt}
          className="border-l-2 border-[var(--color-border-strong)] pl-[var(--space-m)] font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]"
        >
          {prompt}
        </li>
      ))}
    </ul>
  );
}

/**
 * THE CASE OBJECT — a plain list, and later the same list altered.
 *
 * Presented as an object on the page rather than as prose: no title, no
 * explanation, no signature, exactly as the Build Brief requires of the first
 * list. The Changed List reuses it so the two read as the same sheet.
 *
 * ACCESSIBILITY. A line through a name is a visual device, and `line-through`
 * alone is announced by almost nothing. Each altered name therefore carries
 * its change in text too, visually hidden but present in the accessible name,
 * so a child using a screen reader learns that Mika is crossed out and that
 * Jude and Zain are new — which is the entire content of the screen.
 *
 * The list is kept together as one object at every width: it never becomes
 * columns and never scrolls sideways.
 */
export function ListObject({
  items,
  label,
}: {
  items: { text: string; mark: "none" | "struck" | "added" }[];
  label?: string;
}) {
  if (items.length === 0) return null;

  return (
    <ul
      aria-label={label}
      className={cn(
        "wla-measure w-full max-w-[22rem] rounded-[var(--radius-surface)]",
        "border border-[var(--color-border)] bg-[var(--color-surface)]",
        "px-[var(--space-l)] py-[var(--space-m)]",
        "font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]",
      )}
    >
      {items.map((item) => (
        <li
          key={item.text}
          className="flex items-baseline gap-[var(--space-s)] py-[var(--space-xs)]"
        >
          <span
            className={cn(
              item.mark === "struck" &&
                "line-through decoration-[var(--color-accent)] decoration-2",
            )}
          >
            {item.text}
          </span>
          {item.mark === "struck" && (
            <span className="sr-only">(crossed out)</span>
          )}
          {item.mark === "added" && (
            <>
              <span className="sr-only">(added)</span>
              <span
                aria-hidden
                className="font-[family-name:var(--font-sans)] text-[length:var(--text-small)] text-[var(--color-text-muted)]"
              >
                added
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * SORT ITEMS — classify a shuffled set, one item at a time.
 *
 * Orientation, not assessment. After each selection the authored
 * classification appears so the child can check their own thinking and change
 * their mind before moving on. Nothing counts how often the two matched: there
 * is no score in state, none in props, and nowhere to put one.
 *
 * Only the completed activity is persisted, not per-item progress — the Build
 * Brief's STATE TO PERSIST list does not include it, and leaving mid-activity
 * resumes at the activity, which is the stage the child was actually on.
 */
export function SortItemsScreen({
  screen,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  /*
   * Memoised on the screen's configuration. Parsing on every render produced a
   * NEW `items` array each time, so the shuffle effect below — which depends
   * on it — re-ran after every render: shuffle → render → new array → shuffle,
   * without end. Found in staging QA: the endless urgent re-renders starved
   * the transition to the next screen, so "Continue" sat on "Saving…" for ever
   * although the save had succeeded, and the list re-shuffled under the child.
   */
  const config = useMemo(
    () => parseScreenConfig("sort_items", screen.configuration),
    [screen.configuration],
  );

  /*
   * Shuffled once per mount, never persisted. The order is presentation, not
   * mission state: two sittings may differ and neither is more correct.
   *
   * Shuffled in an effect rather than during render, because this component is
   * server-rendered first: randomising in render would produce one order on
   * the server and another on the client, and React would tear the list apart
   * at hydration. The authored order is rendered, then replaced on mount.
   */
  const [items, setItems] = useState(config.items);

  useEffect(() => {
    if (!config.shuffle) return;
    /*
     * react-hooks/set-state-in-effect exists to stop render→effect→render
     * cascades. This runs once per sorting screen and settles immediately,
     * which is the case the rule cannot distinguish.
     *
     * The alternative — shuffling during render — is what the effect is here
     * to avoid: this component is server-rendered, so a random order in render
     * would differ between server and client and tear the list apart at
     * hydration. A fixed authored order would sidestep both, but the Build
     * Brief asks for a shuffle and a fixed order is not one.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(shuffle(config.items));
    // Re-shuffles only if the child lands on a different sorting screen.
  }, [screen.screenKey, config.shuffle, config.items]);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const item = items[index];
  const isLast = index === items.length - 1;
  const categoryLabel = (id: string) =>
    config.categories.find((c) => c.id === id)?.label ?? id;

  return (
    <ScreenFrame
      title={screen.title}
      body={screen.body}
      instruction={config.instruction}
      missionControl={config.missionControl}
      error={error}
      action={
        selected === null ? null : isLast ? (
          <PrimaryAction
            label={config.actionLabel ?? "Continue"}
            isPending={isPending}
            onClick={() =>
              onAdvance({ kind: "visit", screenKey: screen.screenKey })
            }
          />
        ) : (
          <PrimaryAction
            label="Next"
            onClick={() => {
              setIndex((i) => i + 1);
              setSelected(null);
            }}
          />
        )
      }
    >
      <div className="flex flex-col gap-[var(--space-l)]">
        {/*
          Position, not progress. "Item 3 of 7" tells the child how much is
          left; a progress bar would imply advancement being earned.
        */}
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Item {index + 1} of {items.length}
        </p>

        <p className="wla-measure font-[family-name:var(--font-serif)] text-[length:var(--text-h2)]">
          {item.text}
        </p>

        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {config.prompt}
        </p>

        {/*
          Three equal choices. Same size, same weight, same order every time,
          no ordering by "correctness" — the Brief requires they be equal and
          the classification is not a mark.
        */}
        <div
          role="group"
          aria-label={config.prompt}
          className="grid gap-[var(--space-m)] sm:grid-cols-3"
        >
          {config.categories.map((category) => (
            <SelectableOption
              key={category.id}
              label={category.label}
              selected={selected === category.id}
              onSelect={() => setSelected(category.id)}
              selectedLabel="Chosen"
            />
          ))}
        </div>

        {selected !== null && (
          <div
            aria-live="polite"
            className="wla-measure rounded-[var(--radius-surface)] bg-[var(--color-surface-sage)] p-[var(--space-l)]"
          >
            <p>
              The Academy records this one as{" "}
              <strong className="font-[var(--weight-semibold)]">
                {categoryLabel(item.classification)}
              </strong>
              .
            </p>
            {/*
              Correction is offered on every item, not only where the child
              differed — which is what keeps this a check rather than a mark.
              Saying "that's wrong" would make it a test.
            */}
            <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              You can change your choice before moving on.
            </p>
          </div>
        )}
      </div>
    </ScreenFrame>
  );
}

/**
 * TRACKER CONFIRMATION — read-only canonical state for the child's branch.
 *
 * The child moves physical counters; this states what the Academy holds to be
 * true so they can check and correct their own tracker. It has no controls, no
 * inputs and no way to report anything back, which is exactly the difference
 * between confirming a tracker and collecting one.
 *
 * The values shown here are also persisted — but by the SERVER, from this
 * screen's configuration, never from this component. See
 * `applyCanonicalTracker` in the engine's persistence module.
 */
export function TrackerConfirmationScreen({
  screen,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig(
    "tracker_confirmation",
    screen.configuration,
  );

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
    >
      {/*
        A description list, because that is what this is: three named things
        and their current value. Neutral confirmation, not progress — no bars,
        no counts, no direction of travel implied.
      */}
      <dl className="wla-measure divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
        {config.rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-wrap items-baseline justify-between gap-[var(--space-m)] py-[var(--space-m)]"
          >
            <dt className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">
              {row.label}
            </dt>
            <dd className="text-[length:var(--text-body)] text-[var(--color-text-muted)]">
              {row.position}
            </dd>
          </div>
        ))}
      </dl>
    </ScreenFrame>
  );
}

/**
 * REFLECTION — read-and-reflect. Collects nothing.
 *
 * Where the Build Brief asks the child to consider a response they did not
 * choose, the labels come from `unusedOptions` and the one they DID choose is
 * filtered out using their own recorded choice. Those labels were on screen
 * when they decided, so showing them again reveals nothing.
 *
 * The consequences of those responses are a different matter, and they are not
 * here to leak: each lives on its own screen, and the only path to screen
 * content returns the child's current screen alone.
 *
 * `selectable` lets the child pick one to think about. That selection is
 * component state with no route out — no interaction kind carries it, so it
 * cannot reach the server even by mistake.
 */
export function ReflectionScreen({
  screen,
  state,
  onAdvance,
  isPending,
  error,
}: ScreenComponentProps) {
  const config = parseScreenConfig("reflection", screen.configuration);
  const [considering, setConsidering] = useState<string | null>(null);

  const chosenId = config.unusedFrom
    ? state.choices[config.unusedFrom]
    : undefined;
  const unused = config.unusedOptions.filter((o) => o.id !== chosenId);

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
    >
      <div className="flex flex-col gap-[var(--space-l)]">
        {unused.length > 0 && (
          <div className="flex flex-col gap-[var(--space-m)]">
            {config.unusedPrompt && (
              <p className="wla-measure font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">
                {config.unusedPrompt}
              </p>
            )}

            {config.selectable ? (
              <div
                role="group"
                aria-label={config.unusedPrompt ?? "Options to consider"}
                className="flex flex-col gap-[var(--space-m)]"
              >
                {unused.map((option) => (
                  <SelectableOption
                    key={option.id}
                    label={option.label}
                    selected={considering === option.id}
                    onSelect={() => setConsidering(option.id)}
                    selectedLabel="Considering"
                  />
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-[var(--space-s)]">
                {unused.map((option) => (
                  <li
                    key={option.id}
                    className={cn(
                      "wla-measure rounded-[var(--radius-surface)] border",
                      "border-[var(--color-border)] bg-[var(--color-surface)]",
                      "px-[var(--space-l)] py-[var(--space-m)]",
                    )}
                  >
                    {option.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ReflectionPrompts prompts={config.prompts} />
      </div>
    </ScreenFrame>
  );
}

/**
 * The Build Brief's "Pause Mission" — a way off the screen that leaves the
 * mission rather than advancing it.
 *
 * A link to Mission Home, not an action: pausing writes nothing, because the
 * position was already persisted when the child arrived here. There is no
 * "save" to perform and therefore no way for pausing to fail.
 */
export function PauseMissionLink({
  missionSlug,
  label,
}: {
  missionSlug: string;
  label: string;
}) {
  return (
    <Link
      href={`/academy/missions/${missionSlug}`}
      className={cn(
        "inline-flex min-h-[var(--target-min)] items-center",
        "text-[length:var(--text-small)] text-[var(--color-text-muted)]",
        "underline decoration-[var(--color-border-strong)] underline-offset-4",
        "hover:text-[var(--color-text)] hover:decoration-[var(--color-primary)]",
      )}
    >
      {label}
    </Link>
  );
}
