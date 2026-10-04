"use client";

import { useActionState, useState } from "react";
import { saveScreenAction, type BuilderState } from "@/features/admin/builder-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError, FormNotice } from "@/components/ui/field";
import { SchemaForm } from "./schema-form";
import { screenConfigByType } from "@/features/mission-engine/schemas";
import { commonScreenConfig } from "@/features/mission-engine/definition";
import { screenCatalog, templateFor } from "@/features/mission-engine/interactions/catalog";

const initial: BuilderState = {};

/** Every type the engine can render, grouped as authors think of them (interactions/catalog.ts). */
const FAMILIES = [...new Set(screenCatalog.map((e) => e.family))];
const starter = (type: string) => JSON.stringify(templateFor(type), null, 2);

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
    screen ? JSON.stringify(screen.configuration, null, 2) : starter("content"),
  );
  const err = (k: string) => state.fieldErrors?.[k];

  function pickType(next: string) {
    setType(next);
    // Only replace the configuration when creating; never clobber an author's
    // existing work on an established screen.
    if (!screen) setConfig(starter(next));
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
          {FAMILIES.map((f) => (
            <optgroup key={f} label={f}>
              {screenCatalog.filter((e) => e.family === f).map((e) => (
                <option key={e.type} value={e.type}>{e.label}</option>
              ))}
            </optgroup>
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

      {/*
        The screen's configuration, as forms generated from the SAME schemas
        the runtime validates against (schema-form.tsx): the type's own fields,
        then the shared logic (routes, gates, effects, Trail, retry, timer,
        media, support). Raw JSON stays available under Advanced. Both edit
        one object, posted unchanged as `configuration`.
      */}
      <input type="hidden" name="configuration" value={config} />
      {(() => {
        let parsed: Record<string, unknown> | null = null;
        try { parsed = JSON.parse(config || "{}"); } catch { parsed = null; }
        const typeSchema = (screenConfigByType as Record<string, unknown>)[type] as Parameters<typeof SchemaForm>[0]["schema"] | undefined;
        const set = (v: unknown) => setConfig(JSON.stringify(v ?? {}, null, 2));
        return (
          <div className="flex flex-col gap-[var(--space-m)]">
            {err("configuration") && <p className="text-[length:var(--text-small)] text-[var(--color-error)]">{err("configuration")}</p>}
            {parsed && typeSchema ? (
              <SchemaForm schema={typeSchema} value={parsed} onChange={set} label={`${type.replace(/_/g, " ")} settings`} />
            ) : (
              <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Fix the JSON under Advanced to use the form.</p>
            )}
            {parsed && (
              <details>
                <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center text-[length:var(--text-label)] font-medium">Logic: routes, conditions, effects, Trail, timing, media, support</summary>
                <div className="mt-[var(--space-s)]">
                  <SchemaForm schema={commonScreenConfig} value={parsed} onChange={set} label="Logic" />
                </div>
              </details>
            )}
            <details>
              <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center text-[length:var(--text-small)] text-[var(--color-text-muted)]">Advanced: edit as JSON</summary>
              <label htmlFor="configuration-json" className="sr-only">Configuration as JSON</label>
              <textarea
                id="configuration-json"
                rows={12}
                value={config}
                onChange={(e) => setConfig(e.target.value)}
                spellCheck={false}
                className="mt-[var(--space-s)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] font-mono text-[length:var(--text-small)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
              />
            </details>
          </div>
        );
      })()}

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
