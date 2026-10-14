"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveScreenAction, type BuilderState } from "@/features/admin/builder-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError, FormNotice } from "@/components/ui/field";
import { SchemaForm } from "./schema-form";
import { useDirtyForm, useSubmitWithoutReset, useUnsavedChanges, UnsavedNote } from "./unsaved-changes";
import { screenConfigByType } from "@/features/mission-engine/schemas";
import { commonScreenConfig } from "@/features/mission-engine/definition";
import { screenCatalog, templateFor } from "@/features/mission-engine/interactions/catalog";
import { thinkingPrompts } from "@/features/mission-engine/patterns";
import { suggestScreenKey } from "@/features/admin/screen-key";

const initial: BuilderState = {};

/** Every type the engine can render, grouped as authors think of them (interactions/catalog.ts). */
const FAMILIES = [...new Set(screenCatalog.map((e) => e.family))];
const starter = (type: string) => JSON.stringify(templateFor(type), null, 2);

/**
 * The shared screen logic, split by what an author is trying to do (D-120):
 * where the child goes next, and everything else a screen can do. Both are
 * the same `commonScreenConfig` object; only the grouping differs.
 */
const LEADS = ["routes", "requires", "otherwise", "required"];
const BEHAVIOUR = Object.keys(commonScreenConfig.shape).filter((k) => !LEADS.includes(k));

const selectCls = "min-h-[var(--target-min)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] text-[length:var(--text-label)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";
const disclosure = "inline-flex min-h-[var(--target-min)] cursor-pointer items-center text-[length:var(--text-label)] font-medium";

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
  existingKeys = [],
  onDone,
  onAdded,
}: {
  missionId: string;
  slug: string;
  version: number;
  screen: EditableScreen | null;
  nextSequence: number;
  /** Keys already used in this version, so a suggested key never clashes. */
  existingKeys?: string[];
  onDone?: () => void;
  /** A NEW screen was saved under this key. */
  onAdded?: (key: string) => void;
}) {
  const [state, action, pending] = useActionState(saveScreenAction, initial);
  const [type, setType] = useState(screen?.type ?? "content");
  const [title, setTitle] = useState(screen?.title ?? "");
  const [key, setKey] = useState(screen?.screen_key ?? "");
  const [keyTouched, setKeyTouched] = useState(Boolean(screen));
  const [config, setConfig] = useState(
    screen ? JSON.stringify(screen.configuration, null, 2) : starter("content"),
  );
  const lastValid = useRef(config);
  const err = (k: string) => state.fieldErrors?.[k];
  const { requestDiscard } = useUnsavedChanges();
  const formId = screen ? `screen:${screen.screen_key}` : "screen:new";
  const name = screen ? `the screen “${screen.title || screen.screen_key}”` : "the new screen";
  const { ref, dirty, saved } = useDirtyForm(formId, name);

  // The key follows the title until the author edits it (new screens only).
  const shownKey = keyTouched ? key : (title.trim() ? suggestScreenKey(title, existingKeys) : "");

  const submittedKey = useRef(shownKey);
  useEffect(() => {
    if (!state.ok) return;
    saved();
    if (!screen) onAdded?.(submittedKey.current);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps -- once per action result

  function pickType(next: string) {
    setType(next);
    // Only replace the configuration when creating; never clobber an author's
    // existing work on an established screen.
    if (!screen) setConfig(starter(next));
  }

  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(config || "{}"); } catch { parsed = null; }
  // Remember the last configuration that parsed, for "Undo the JSON edits".
  useEffect(() => {
    try { JSON.parse(config || "{}"); lastValid.current = config; } catch { /* keep the previous one */ }
  }, [config]);
  const typeSchema = (screenConfigByType as Record<string, unknown>)[type] as Parameters<typeof SchemaForm>[0]["schema"] | undefined;
  const set = (v: unknown) => setConfig(JSON.stringify(v ?? {}, null, 2));
  const typeEntry = screenCatalog.find((e) => e.type === type);
  const configured = parsed ? LEADS.filter((k) => parsed[k] !== undefined).length : 0;

  const close = () => requestDiscard([formId], () => onDone?.());
  const submit = useSubmitWithoutReset(action, () => { submittedKey.current = shownKey; });

  return (
    <form
      ref={ref}
      action={action}
      onSubmit={submit}
      className="flex flex-col gap-[var(--space-m)]"
    >
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      {!screen && <input type="hidden" name="isNew" value="1" />}

      {state.error && <FormError message={state.error} />}
      {state.ok && screen && <FormNotice message="Screen saved." />}

      {!screen && (
        <Field label="Start from a thinking prompt (optional)" htmlFor="thinking-prompt" hint="A short reflection that fits the mission's rhythm. You can recall earlier answers with {{response.screen_key}} or {{choice.screen_key}}.">
          <select
            id="thinking-prompt"
            defaultValue=""
            onChange={(e) => {
              const t = thinkingPrompts.find((x) => x.id === e.target.value);
              if (!t) return;
              setType(t.type);
              setConfig(JSON.stringify(t.configuration, null, 2));
              setTitle(t.title);
            }}
            className={selectCls}
          >
            <option value="">—</option>
            {thinkingPrompts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      )}

      <Field label="Title" htmlFor="title" error={err("title")} hint="What the child sees at the top of the screen. It also names the screen everywhere in the builder.">
        <Input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <Field label="What the child does here" htmlFor="type" error={err("type")} hint={screen ? "Changing the type keeps the settings below; check them afterwards." : "Each type is one kind of step. More in Help → Screen types."}>
        <select id="type" name="type" value={type} onChange={(e) => pickType(e.target.value)} className={selectCls}>
          {FAMILIES.map((f) => (
            <optgroup key={f} label={f}>
              {screenCatalog.filter((e) => e.family === f).map((e) => (
                <option key={e.type} value={e.type}>{e.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      <Field label="Body" htmlFor="body" error={err("body")} hint="The main text, if the screen needs any.">
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
        then where the screen leads, then its other behaviour. Raw JSON stays
        available under Advanced. All three edit one object, posted unchanged
        as `configuration`.
      */}
      <input type="hidden" name="configuration" value={config} />
      {err("configuration") && <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">{err("configuration")}</p>}

      {parsed && typeSchema ? (
        <SchemaForm schema={typeSchema} value={parsed} onChange={set} label={`${typeEntry?.label.split(" — ")[0] ?? type.replace(/_/g, " ")} settings`} />
      ) : (
        <div className="rounded-[var(--radius-input)] border border-[var(--color-error)] p-[var(--space-s)] text-[length:var(--text-small)]">
          <p>The settings can&rsquo;t be shown as a form because the JSON under Advanced isn&rsquo;t valid.</p>
          <Button type="button" variant="text" onClick={() => setConfig(lastValid.current)}>Undo the JSON edits</Button>
        </div>
      )}

      {parsed && (
        <details open className="rounded-[var(--radius-surface)] border border-[var(--color-border)] p-[var(--space-m)]">
          <summary className={disclosure}>
            Where this screen leads{configured ? ` (${configured} set)` : ""}
          </summary>
          <div className="mt-[var(--space-xs)] flex flex-col gap-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            <p>
              After this screen, the child goes to the first <strong>route</strong> whose condition is true, checked from
              the top. If none is true, they follow the option they chose (on a decision) or this screen&rsquo;s
              &ldquo;Goes to&rdquo;. Every screen except the completion screen needs a way on: a &ldquo;Goes to&rdquo;,
              a route, or options that each lead somewhere.
            </p>
            <p>
              Example: route 1 &ldquo;Variable torch is true → The cave&rdquo;, route 2 &ldquo;Always → The long way&rdquo;.
              A child with the torch goes to the cave; everyone else takes the long way. Order matters — swap them and
              everyone takes the long way.
            </p>
            <p>
              &ldquo;Shown only when&rdquo; works the other way round: a child who doesn&rsquo;t meet it skips this
              screen and goes to &ldquo;Otherwise goes to&rdquo; instead.
            </p>
          </div>
          <div className="mt-[var(--space-s)]">
            <SchemaForm schema={commonScreenConfig} value={parsed} onChange={set} label="" hide={BEHAVIOUR} />
          </div>
        </details>
      )}

      {parsed && (
        <details className="rounded-[var(--radius-surface)] border border-[var(--color-border)] p-[var(--space-m)]">
          <summary className={disclosure}>More behaviour: mission state, Trail, timing, media, support</summary>
          <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Optional. What this screen changes or adds beyond its own content.
          </p>
          <div className="mt-[var(--space-s)]">
            <SchemaForm schema={commonScreenConfig} value={parsed} onChange={set} label="" hide={LEADS} />
          </div>
        </details>
      )}

      <details className="rounded-[var(--radius-surface)] border border-[var(--color-border)] p-[var(--space-m)]">
        <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Advanced: screen key, position, JSON
        </summary>
        <div className="mt-[var(--space-s)] grid gap-[var(--space-m)] sm:grid-cols-2">
          <Field
            label="Screen key"
            htmlFor="screen_key"
            error={err("screen_key")}
            hint={screen ? "Other screens point at this. It can't change once the screen exists." : "Suggested from the title. Lower-case words and underscores; fixed once the screen is added."}
          >
            <Input
              id="screen_key"
              name="screen_key"
              required
              value={shownKey}
              readOnly={Boolean(screen)}
              onChange={(e) => { setKeyTouched(true); setKey(e.target.value); }}
              placeholder="the_list"
            />
          </Field>
          <Field label="Position" htmlFor="sequence" error={err("sequence")} hint="Order in the list. The arrows on each screen do the same.">
            <Input id="sequence" name="sequence" type="number" required defaultValue={screen?.sequence ?? nextSequence} />
          </Field>
        </div>
        <label htmlFor="configuration-json" className="mt-[var(--space-m)] block text-[length:var(--text-small)] font-medium">Settings as JSON</label>
        <textarea
          id="configuration-json"
          rows={12}
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          spellCheck={false}
          className="mt-[var(--space-xs)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] font-mono text-[length:var(--text-small)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        />
      </details>

      {/* A key error is otherwise hidden inside Advanced. */}
      {err("screen_key") && <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">Screen key: {err("screen_key")} (under Advanced)</p>}

      <div className="flex flex-wrap items-center gap-[var(--space-m)]">
        <Button type="submit" isLoading={pending} loadingLabel="Saving…" disabled={!shownKey}>
          {screen ? "Save screen" : "Add screen"}
        </Button>
        {onDone && (
          <Button type="button" variant="text" onClick={close}>
            {screen ? "Close" : "Cancel"}
          </Button>
        )}
        <UnsavedNote dirty={dirty} />
        {!screen && !shownKey && (
          <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Give the screen a title to add it.</span>
        )}
      </div>
    </form>
  );
}
