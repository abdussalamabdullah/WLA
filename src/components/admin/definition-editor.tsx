"use client";

import { useActionState, useEffect, useState } from "react";
import { saveDefinitionAction, type BuilderState } from "@/features/admin/builder-actions";
import { missionDefinition, type MissionDefinition } from "@/features/mission-engine/definition";
import { friendlyFirstIssue } from "@/features/mission-engine/issue-text";
import { Button } from "@/components/ui/button";
import { FormError, FormNotice } from "@/components/ui/field";
import { SchemaForm } from "./schema-form";
import { SectionHeader } from "./section-header";
import { useDirtyForm, useSubmitWithoutReset, useUnsavedChanges, UnsavedNote } from "./unsaved-changes";

const initial: BuilderState = {};

/** Sections of the mission definition, in WLA terms, with what each is for. */
const SECTIONS: { key: keyof MissionDefinition; title: string; one: string; many: string; help: string }[] = [
  { key: "variables", title: "Variables", one: "variable", many: "variables", help: "What the mission remembers: counters, resources, clues, choices made elsewhere. Visible ones may appear on screen; hidden ones never leave the server." },
  { key: "unlocks", title: "Unlocks", one: "unlock", many: "unlocks", help: "Things that open once a condition holds — a screen, a resource, an option — and stay open." },
  { key: "events", title: "Changing conditions", one: "changing condition", many: "changing conditions", help: "Something changes after the child has acted: new evidence, a route closing, a resource removed, a rule changing." },
  { key: "variants", title: "Variants", one: "variant", many: "variants", help: "Approved versions of the starting situation. Each run gets one, kept for the whole run." },
  { key: "pools", title: "Controlled randomisation", one: "random pool", many: "random pools", help: "Draw from an approved pool, with weights and exclusions. The draw is kept for the whole run." },
  { key: "checkpoints", title: "Checkpoints and stages", one: "checkpoint", many: "checkpoints", help: "Points to come back to across sessions, and stages that open after a real-world interval." },
  { key: "prints", title: "Printables", one: "printable", many: "printables", help: "Kit PDFs filled with this run's values — a variant's code, a drawn clue. Based on an approved PDF in this version's Kit; screens offer them with `prints`." },
  { key: "qr", title: "QR codes", one: "QR code", many: "QR codes", help: "Codes printed in the Kit that lead back here: open the mission, open a Kit resource, or scan to reveal. Print them from the QR sheet." },
  { key: "workspaces", title: "Workspaces", one: "workspace", many: "workspaces", help: "Boards that persist across screens: evidence, clues, routes, resources, relationships. Objects appear as the mission allows; placements are remembered." },
  { key: "stages", title: "Stage names (for reporting)", one: "stage name", many: "stage names", help: "Screen key → stage name, so insights group drop-off by stage." },
];

const countOf = (v: unknown) => (Array.isArray(v) ? v.length : Object.keys((v ?? {}) as object).length);

/** "2 variables, 1 QR code" — what this mission's logic actually uses. */
export function logicSummary(def: MissionDefinition): string {
  const parts = SECTIONS.map((s) => [countOf(def[s.key]), s] as const)
    .filter(([n]) => n > 0)
    .map(([n, s]) => `${n} ${n === 1 ? s.one : s.many}`);
  if (def.completion) parts.push("a completion condition");
  return parts.join(", ");
}

/**
 * MISSION LOGIC — the definition half of the canonical model (F8), edited
 * with forms generated from the schema the runtime itself uses.
 *
 * Optional and advanced, so collapsed by default (D-120) — but it opens
 * itself when the checks find a blocking problem here, so nothing that needs
 * attention is hidden, and its summary says what is in use.
 */
export function DefinitionEditor(props: {
  missionId: string;
  slug: string;
  version: number;
  definition: MissionDefinition;
  /** Blocking issues the checks attribute to mission logic. */
  attention?: number;
}) {
  const [generation, setGeneration] = useState(0);
  return <DefinitionForm key={generation} {...props} onDiscard={() => setGeneration((n) => n + 1)} />;
}

function DefinitionForm({
  missionId, slug, version, definition, attention = 0, onDiscard,
}: {
  missionId: string; slug: string; version: number; definition: MissionDefinition;
  attention?: number; onDiscard: () => void;
}) {
  const [value, setValue] = useState<MissionDefinition>(definition);
  // The JSON text while it is being edited (null = derived from `value`).
  const [raw, setRaw] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(saveDefinitionAction, initial);
  const parsed = missionDefinition.safeParse(value);
  const shape = missionDefinition.shape;
  const { requestDiscard } = useUnsavedChanges();
  const { ref, dirty, saved } = useDirtyForm("logic", "Mission logic");
  const submit = useSubmitWithoutReset(action);
  useEffect(() => { if (state.ok) saved(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps -- once per action result

  const inUse = logicSummary(definition);
  // Opens itself when something here blocks publishing; never snaps shut.
  const [open, setOpen] = useState(attention > 0);

  return (
    <section className="mt-[var(--space-2xl)]" aria-labelledby="mission-logic">
      <SectionHeader
        id="mission-logic"
        title="Mission logic"
        purpose="Optional. Most missions don't need it. It holds what the mission remembers and what changes as the child acts."
        more={<p>Variables, unlocks, changing conditions, variants, randomisation, checkpoints, printables, QR codes and boards for the whole mission. Screens use them in their routes, conditions and effects.</p>}
        helpAnchor="mission-logic"
      />

      <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="mt-[var(--space-m)] rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
        <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer flex-wrap items-center gap-x-[var(--space-xs)] font-medium">
          Advanced mission logic (optional)
          <span className="font-normal text-[var(--color-text-muted)]">— {inUse ? `in use: ${inUse}` : "not used"}</span>
          {attention > 0 && <span className="font-medium text-[var(--color-error)]">· needs attention ({attention})</span>}
        </summary>

        <form ref={ref} action={action} onSubmit={submit} className="mt-[var(--space-m)] flex flex-col gap-[var(--space-m)]">
          <input type="hidden" name="missionId" value={missionId} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="definition" value={JSON.stringify(value)} />
          {state.error && <FormError message={state.error} />}
          {state.fieldErrors?.definition && <FormError message={state.fieldErrors.definition} />}
          {state.ok && <FormNotice message="Mission logic saved." />}

          {SECTIONS.map((sec) => (
            <details key={sec.key} className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
              <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center font-medium">
                {sec.title} <span className="ml-[var(--space-xs)] text-[var(--color-text-muted)]">({countOf(value[sec.key])})</span>
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
          ))}

          <details className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
            <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center font-medium">Completion condition (optional)</summary>
            <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              When set, this decides when the mission is complete, and the rule in the{" "}
              <a href="#builder-completion" className="underline underline-offset-4">Completion</a> section further down
              is not used. Leave it empty unless the ordinary rule can&rsquo;t express what you need.
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
                  setJsonError("This JSON isn't valid yet. The forms above keep the last valid version until it is.");
                }
              }}
              onBlur={() => { if (!jsonError) setRaw(null); }}
              spellCheck={false}
              className="mt-[var(--space-s)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] font-mono text-[length:var(--text-small)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
            />
            {jsonError && <p className="text-[length:var(--text-small)] text-[var(--color-error)]">{jsonError}</p>}
          </details>

          {!parsed.success && (
            <p role="alert" className="text-[length:var(--text-small)] text-[var(--color-error)]">
              Not ready to save: {friendlyFirstIssue(parsed.error.issues, "Mission logic")}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-[var(--space-m)]">
            <Button type="submit" isLoading={pending} loadingLabel="Saving…" disabled={!parsed.success || Boolean(jsonError)}>Save mission logic</Button>
            {dirty && (
              <Button type="button" variant="text" onClick={() => requestDiscard(["logic"], onDiscard)}>Discard changes</Button>
            )}
            <UnsavedNote dirty={dirty} />
          </div>
        </form>
      </details>
    </section>
  );
}
