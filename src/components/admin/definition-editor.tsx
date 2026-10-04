"use client";

import { useActionState, useState } from "react";
import { saveDefinitionAction, type BuilderState } from "@/features/admin/builder-actions";
import { missionDefinition, type MissionDefinition } from "@/features/mission-engine/definition";
import { Button } from "@/components/ui/button";
import { FormError, FormNotice } from "@/components/ui/field";
import { SchemaForm } from "./schema-form";

const initial: BuilderState = {};

/** Sections of the mission definition, in WLA terms, with what each is for. */
const SECTIONS: { key: keyof MissionDefinition; title: string; help: string }[] = [
  { key: "variables", title: "Variables", help: "What the mission remembers: counters, resources, clues, choices made elsewhere. Visible ones may appear on screen; hidden ones never leave the server." },
  { key: "unlocks", title: "Unlocks", help: "Things that open once a condition holds — a screen, a resource, an option — and stay open." },
  { key: "events", title: "Changing conditions", help: "Something changes after the child has acted: new evidence, a route closing, a resource removed, a rule changing." },
  { key: "variants", title: "Variants", help: "Approved versions of the starting situation. Each run gets one, kept for the whole run." },
  { key: "pools", title: "Controlled randomisation", help: "Draw from an approved pool, with weights and exclusions. The draw is kept for the whole run." },
  { key: "checkpoints", title: "Checkpoints and stages", help: "Points to come back to across sessions, and stages that open after a real-world interval." },
  { key: "workspaces", title: "Workspaces", help: "Boards that persist across screens: evidence, clues, routes, resources, relationships. Objects appear as the mission allows; placements are remembered." },
  { key: "stages", title: "Stage names (for reporting)", help: "Screen key → stage name, so insights group drop-off by stage." },
];

/**
 * MISSION LOGIC — the definition half of the canonical model (F8), edited
 * with forms generated from the schema the runtime itself uses.
 */
export function DefinitionEditor({
  missionId,
  slug,
  version,
  definition,
}: {
  missionId: string;
  slug: string;
  version: number;
  definition: MissionDefinition;
}) {
  const [value, setValue] = useState<MissionDefinition>(definition);
  // The JSON text while it is being edited (null = derived from `value`).
  const [raw, setRaw] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(saveDefinitionAction, initial);
  const parsed = missionDefinition.safeParse(value);
  const shape = missionDefinition.shape;

  return (
    <section className="mt-[var(--space-2xl)]" aria-labelledby="mission-logic">
      <h2 id="mission-logic" className="text-[length:var(--text-h3)]">Mission logic</h2>
      <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)]">
        Variables, unlocks, changing conditions, variants and stages for the whole mission.
        Screens use them in their routes, conditions and effects.
      </p>

      <form action={action} className="mt-[var(--space-m)] flex flex-col gap-[var(--space-m)]">
        <input type="hidden" name="missionId" value={missionId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="definition" value={JSON.stringify(value)} />
        {state.error && <FormError message={state.error} />}
        {state.fieldErrors?.definition && <FormError message={state.fieldErrors.definition} />}
        {state.ok && <FormNotice message="Mission logic saved." />}

        {SECTIONS.map((sec) => {
          const count = Array.isArray(value[sec.key]) ? (value[sec.key] as unknown[]).length : Object.keys((value[sec.key] ?? {}) as object).length;
          return (
            <details key={sec.key} className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
              <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center font-medium">
                {sec.title} <span className="ml-[var(--space-xs)] text-[var(--color-text-muted)]">({count})</span>
              </summary>
              <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">{sec.help}</p>
              <div className="mt-[var(--space-s)]">
                <SchemaForm
                  schema={shape[sec.key]}
                  value={value[sec.key]}
                  fieldKey={String(sec.key)}
                  onChange={(v) => setValue({ ...value, [sec.key]: v } as MissionDefinition)}
                />
              </div>
            </details>
          );
        })}

        <details className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
          <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center font-medium">Completion condition (optional)</summary>
          <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            When set, this decides when the mission is complete — instead of the completion rule below.
          </p>
          {value.completion ? (
            <div className="mt-[var(--space-s)] flex flex-col gap-[var(--space-s)]">
              <SchemaForm schema={shape.completion} value={value.completion} fieldKey="completion" label="Complete when" onChange={(v) => setValue({ ...value, completion: v as MissionDefinition["completion"] })} />
              <Button type="button" variant="text" onClick={() => { const n = { ...value }; delete n.completion; setValue(n); }}>Remove completion condition</Button>
            </div>
          ) : (
            <Button type="button" variant="text" onClick={() => setValue({ ...value, completion: { always: true } })}>Add completion condition</Button>
          )}
        </details>

        <details>
          <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center text-[length:var(--text-small)] text-[var(--color-text-muted)]">Advanced: edit as JSON</summary>
          <label htmlFor="definition-json" className="sr-only">Mission logic as JSON</label>
          <textarea
            id="definition-json"
            rows={12}
            value={raw ?? JSON.stringify(value, null, 2)}
            onChange={(e) => {
              setRaw(e.target.value);
              try {
                setValue(JSON.parse(e.target.value) as MissionDefinition);
                setJsonError(null);
              } catch {
                setJsonError("Not valid JSON yet.");
              }
            }}
            onBlur={() => { if (!jsonError) setRaw(null); }}
            spellCheck={false}
            className="mt-[var(--space-s)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] font-mono text-[length:var(--text-small)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          />
          {jsonError && <p className="text-[length:var(--text-small)] text-[var(--color-error)]">{jsonError}</p>}
        </details>

        {!parsed.success && (
          <p className="text-[length:var(--text-small)] text-[var(--color-error)]">
            Not ready to save: {parsed.error.issues[0]?.path.join(".")} — {parsed.error.issues[0]?.message}
          </p>
        )}
        <div>
          <Button type="submit" isLoading={pending} loadingLabel="Saving…" disabled={!parsed.success || Boolean(jsonError)}>Save mission logic</Button>
        </div>
      </form>
    </section>
  );
}
