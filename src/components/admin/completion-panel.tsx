"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { setCompletionRuleAction, type BuilderState } from "@/features/admin/builder-actions";
import { basicRuleScreen, effectiveCompletion } from "@/features/admin/completion-text";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice } from "@/components/ui/field";
import { SectionHeader } from "./section-header";
import { useDirtyForm, useSubmitWithoutReset, useUnsavedChanges, UnsavedNote } from "./unsaved-changes";

const initial: BuilderState = {};

type ScreenLite = { screen_key: string; title: string | null; type: string };

/**
 * COMPLETION — when the Academy treats the mission as finished (D-115).
 *
 * The ordinary rule ("complete when the child reaches a screen") is a form.
 * Anything else stays editable as JSON under Advanced, and is never rewritten
 * just because the panel was opened: a custom rule loads in Advanced mode and
 * is only replaced if the author chooses the basic rule and saves.
 *
 * The panel always says which completion is IN FORCE. When Mission logic has
 * its own completion condition, the runtime uses that and ignores this rule
 * (runtime.ts `completionCondition`); the panel says so rather than letting
 * an author edit a rule that has no effect.
 */
export function CompletionPanel(props: {
  missionId: string;
  slug: string;
  version: number;
  rule: unknown;
  definitionCompletion: unknown;
  screens: ScreenLite[];
}) {
  const [generation, setGeneration] = useState(0);
  return <CompletionForm key={generation} {...props} onDiscard={() => setGeneration((n) => n + 1)} />;
}

function CompletionForm({
  missionId, slug, version, rule, definitionCompletion, screens, onDiscard,
}: {
  missionId: string; slug: string; version: number;
  rule: unknown; definitionCompletion: unknown; screens: ScreenLite[];
  onDiscard: () => void;
}) {
  const [state, action, pending] = useActionState(setCompletionRuleAction, initial);
  const basicKey = basicRuleScreen(rule);
  const isCustom = rule !== null && rule !== undefined && basicKey === null;
  const ending = screens.filter((s) => s.type === "completion");
  const [mode, setMode] = useState<"basic" | "advanced">(isCustom ? "advanced" : "basic");
  const [screenKey, setScreenKey] = useState(basicKey ?? ending[0]?.screen_key ?? "");
  const [json, setJson] = useState(
    rule ? JSON.stringify(rule, null, 2) : `{\n  "type": "screen_reached",\n  "screenKey": ""\n}`,
  );
  const uid = useId();
  const { requestDiscard } = useUnsavedChanges();
  const { ref, dirty, saved } = useDirtyForm("completion", "the completion rule");
  const submit = useSubmitWithoutReset(action);
  useEffect(() => { if (state.ok) saved(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps -- once per action result

  const titles = new Map(screens.map((s) => [s.screen_key, s.title || s.screen_key]));
  const effect = effectiveCompletion({ rule, definitionCompletion, titles });
  const posted = mode === "basic" ? JSON.stringify({ type: "screen_reached", screenKey }) : json;
  const others = screens.filter((s) => s.type !== "completion");

  return (
    <section className="mt-[var(--space-2xl)] max-w-[46rem]" aria-labelledby="builder-completion">
      <SectionHeader
        id="builder-completion"
        title="Completion"
        purpose="When the Academy treats the mission as finished, which closes it and its Mission Trail."
        more={<p>Most missions are complete when the child reaches the completion screen. A custom rule can require more, such as an answer on a particular screen. Completion is closure, not a score.</p>}
        helpAnchor="completion"
      />

      <p className="mt-[var(--space-m)] rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-s)] text-[length:var(--text-small)]">
        <strong>In force now:</strong> {effect.inEffect}
      </p>
      {effect.source === "definition" && (
        <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          The rule below is kept, but isn&rsquo;t used while that condition is set. To use it, remove the completion
          condition in <a href="#mission-logic" className="underline underline-offset-4">Mission logic</a>.
        </p>
      )}

      <form ref={ref} action={action} onSubmit={submit} className="mt-[var(--space-m)] flex flex-col gap-[var(--space-m)]">
        <input type="hidden" name="missionId" value={missionId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="rule" value={posted} />

        {state.error && <FormError message={state.error} />}
        {state.ok && <FormNotice message="Completion rule saved." />}

        <fieldset className="flex flex-col gap-[var(--space-xs)]">
          <legend className="mb-[var(--space-xs)] text-[length:var(--text-label)] font-medium">The rule</legend>
          <label className="flex min-h-[var(--target-min)] items-center gap-[var(--space-s)]">
            <input type="radio" name={`${uid}-mode`} checked={mode === "basic"} onChange={() => setMode("basic")} className="h-5 w-5 accent-[var(--color-primary)]" />
            When the child reaches a screen
          </label>
          <label className="flex min-h-[var(--target-min)] items-center gap-[var(--space-s)]">
            <input type="radio" name={`${uid}-mode`} checked={mode === "advanced"} onChange={() => setMode("advanced")} className="h-5 w-5 accent-[var(--color-primary)]" />
            A custom rule (advanced)
          </label>
        </fieldset>

        {mode === "basic" ? (
          <>
            <Field label="Mark the mission complete when the child reaches" htmlFor={`${uid}-screen`} error={state.fieldErrors?.rule}>
              <select
                id={`${uid}-screen`}
                value={screenKey}
                onChange={(e) => setScreenKey(e.target.value)}
                className="min-h-[var(--target-min)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] text-[length:var(--text-label)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
              >
                <option value="">— Choose a screen —</option>
                {screenKey && !titles.has(screenKey) && <option value={screenKey}>{screenKey} (not a screen in this version)</option>}
                {ending.length > 0 && (
                  <optgroup label="Completion screens">
                    {ending.map((s) => <option key={s.screen_key} value={s.screen_key}>{s.title || s.screen_key}</option>)}
                  </optgroup>
                )}
                {others.length > 0 && (
                  <optgroup label="Other screens">
                    {others.map((s) => <option key={s.screen_key} value={s.screen_key}>{s.title || s.screen_key}</option>)}
                  </optgroup>
                )}
              </select>
            </Field>
            {(rule === null || rule === undefined) && screens.length > 0 && (
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Nothing is saved yet. Check the screen, then save.</p>
            )}
            {screens.length === 0 && (
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Add screens first, including a completion screen.</p>
            )}
            {isCustom && (
              <p role="note" className="wla-measure text-[length:var(--text-small)]">
                This version currently has a custom rule{effect.ruleText ? ` (complete when ${effect.ruleText})` : ""}.
                Saving will replace it with the rule above.
              </p>
            )}
          </>
        ) : (
          <Field
            label="Custom rule (JSON)"
            htmlFor={`${uid}-json`}
            error={state.fieldErrors?.rule}
            hint="For rules the form can't express, such as needing an answer or a particular choice. Help → How completion works lists the shapes."
          >
            <textarea
              id={`${uid}-json`}
              rows={8}
              spellCheck={false}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] font-mono text-[length:var(--text-small)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            />
          </Field>
        )}

        <div className="flex flex-wrap items-center gap-[var(--space-m)]">
          <Button type="submit" isLoading={pending} loadingLabel="Saving…" disabled={mode === "basic" && !screenKey}>
            Save completion rule
          </Button>
          {dirty && (
            <Button type="button" variant="text" onClick={() => requestDiscard(["completion"], onDiscard)}>
              Discard changes
            </Button>
          )}
          <UnsavedNote dirty={dirty} />
        </div>
      </form>
    </section>
  );
}
