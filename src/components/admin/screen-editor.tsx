"use client";

import { useActionState, useState } from "react";
import { saveScreenAction, type BuilderState } from "@/features/admin/builder-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError, FormNotice } from "@/components/ui/field";

const initial: BuilderState = {};

/** The twelve types the engine's registry can render. Nothing else is
 *  offerable, because nothing else could be shown to a learner. */
const SCREEN_TYPES = [
  { value: "content", label: "Content — text the child reads" },
  { value: "prepare", label: "Prepare — get materials ready" },
  { value: "handoff", label: "Handoff — go and do something physical" },
  { value: "choice", label: "Decision — one choice, branches" },
  { value: "multi_choice", label: "Multi-choice — pick several" },
  { value: "response", label: "Response — write an answer" },
  { value: "reflection", label: "Reflection — think back" },
  { value: "reveal", label: "Reveal — show something held back" },
  { value: "tracker", label: "Tracker — record a position" },
  { value: "tracker_confirmation", label: "Tracker confirmation" },
  { value: "sort_items", label: "Sort — order or group items" },
  { value: "completion", label: "Completion — the end" },
];

/**
 * Starter configuration per type, so an author is never faced with an empty
 * JSON box. Each names every field the engine's schema REQUIRES, so once the
 * blanks are filled it saves. A test fills each blank and parses it against
 * `screenConfigByType` — 9 of 12 once shipped with missing or misnamed fields
 * and could not be saved however they were filled in.
 */
const TEMPLATE: Record<string, string> = {
  content: `{\n  "next": ""\n}`,
  prepare: `{\n  "materials": [""],\n  "next": ""\n}`,
  handoff: `{\n  "location": "",\n  "steps": [""],\n  "returnInstruction": "",\n  "next": ""\n}`,
  choice: `{\n  "prompt": "",\n  "options": [\n    { "id": "", "label": "", "next": "" },\n    { "id": "", "label": "", "next": "" }\n  ]\n}`,
  multi_choice: `{\n  "prompt": "",\n  "options": [\n    { "id": "", "label": "" },\n    { "id": "", "label": "" }\n  ],\n  "next": ""\n}`,
  response: `{\n  "prompt": "",\n  "next": ""\n}`,
  reflection: `{\n  "prompts": [""],\n  "next": ""\n}`,
  reveal: `{\n  "concealedPrompt": "",\n  "revealedBody": "",\n  "condition": { "type": "child_action" },\n  "next": ""\n}`,
  tracker: `{\n  "prompt": "",\n  "dimensions": [{ "id": "", "label": "", "positions": ["", ""] }],\n  "next": ""\n}`,
  tracker_confirmation: `{\n  "rows": [{ "label": "", "position": "" }],\n  "next": ""\n}`,
  sort_items: `{\n  "prompt": "",\n  "categories": [{ "id": "", "label": "" }, { "id": "", "label": "" }],\n  "items": [{ "id": "", "text": "", "classification": "" }],\n  "next": ""\n}`,
  completion: `{\n  "message": "",\n  "trailEntries": []\n}`,
};

export type EditableScreen = {
  screen_key: string;
  type: string;
  title: string | null;
  body: string | null;
  sequence: number;
  configuration: unknown;
};

export function ScreenEditor({
  missionId,
  slug,
  version,
  screen,
  nextSequence,
  onDone,
}: {
  missionId: string;
  slug: string;
  version: number;
  screen: EditableScreen | null;
  nextSequence: number;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveScreenAction, initial);
  const [type, setType] = useState(screen?.type ?? "content");
  const [config, setConfig] = useState(
    screen ? JSON.stringify(screen.configuration, null, 2) : TEMPLATE.content,
  );
  const err = (k: string) => state.fieldErrors?.[k];

  function pickType(next: string) {
    setType(next);
    // Only replace the configuration when creating; never clobber an author's
    // existing work on an established screen.
    if (!screen) setConfig(TEMPLATE[next] ?? "{}");
  }

  return (
    <form action={action} className="flex flex-col gap-[var(--space-m)]">
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />

      {state.error && <FormError message={state.error} />}
      {state.ok && <FormNotice message="Screen saved." />}

      <div className="grid gap-[var(--space-m)] sm:grid-cols-2">
        <Field
          label="Screen key"
          htmlFor="screen_key"
          error={err("screen_key")}
          hint="Lower case and underscores. Other screens point at this."
        >
          <Input
            id="screen_key"
            name="screen_key"
            required
            defaultValue={screen?.screen_key ?? ""}
            readOnly={Boolean(screen)}
            placeholder="the_list"
          />
        </Field>

        <Field label="Position" htmlFor="sequence" error={err("sequence")}>
          <Input
            id="sequence"
            name="sequence"
            type="number"
            required
            defaultValue={screen?.sequence ?? nextSequence}
          />
        </Field>
      </div>

      <Field label="Type" htmlFor="type" error={err("type")}>
        <select
          id="type"
          name="type"
          value={type}
          onChange={(e) => pickType(e.target.value)}
          className="min-h-[var(--target-min)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] text-[length:var(--text-label)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        >
          {SCREEN_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Title" htmlFor="title" error={err("title")}>
        <Input id="title" name="title" defaultValue={screen?.title ?? ""} />
      </Field>

      <Field label="Body" htmlFor="body" error={err("body")}>
        <textarea
          id="body"
          name="body"
          rows={4}
          defaultValue={screen?.body ?? ""}
          className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] text-[length:var(--text-label)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        />
      </Field>

      <Field
        label="Configuration"
        htmlFor="configuration"
        error={err("configuration")}
        hint="Choices, branches and reveals live here. It is checked against what the Academy can actually render."
      >
        <textarea
          id="configuration"
          name="configuration"
          rows={12}
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          spellCheck={false}
          className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] font-mono text-[length:var(--text-small)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        />
      </Field>

      <div className="flex gap-[var(--space-s)]">
        <Button type="submit" isLoading={pending} loadingLabel="Saving…">
          {screen ? "Save screen" : "Add screen"}
        </Button>
        {onDone && (
          <Button type="button" variant="text" onClick={onDone}>
            Done
          </Button>
        )}
      </div>
    </form>
  );
}
