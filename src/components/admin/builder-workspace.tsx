"use client";

import { AssetManager } from "./asset-manager";
import type { ResolvedAsset } from "@/features/mission-engine/media";
import { useActionState, useState } from "react";
import { ScreenEditor, type EditableScreen } from "./screen-editor";
import { KitEditor, ParentNoteEditor, type DraftResource } from "./kit-editor";
import { DefinitionEditor } from "./definition-editor";
import { FlowMap } from "./flow-map";
import { VocabularyProvider } from "./schema-form";
import { emptyDefinition, type MissionDefinition } from "@/features/mission-engine/definition";
import {
  deleteScreenAction,
  moveScreenAction,
  setCompletionRuleAction,
  setVersionStatusAction,
  type BuilderState,
} from "@/features/admin/builder-actions";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const initial: BuilderState = {};

type Problem = {
  code: string;
  blocking: boolean;
  screen_key: string | null;
  detail: string;
};

/**
 * The builder workspace: Structure, Completion, Review and Publish.
 *
 * VALIDATION IS SHOWN, NOT ENFORCED HERE. Publishing is refused by
 * `set_mission_version_status`, which re-runs `validate_mission_version`
 * inside the same transaction. This panel exists so an author can see what is
 * wrong; it is not what stops a bad version going out.
 */
export function BuilderWorkspace({
  missionId,
  slug,
  version,
  status,
  completionRule,
  screens,
  blocking,
  advisory,
  resources,
  noteContent,
  noteDocumentPath,
  noteDocumentUrl,
  paths = [],
  definition = null,
  assets = { rows: [], resolved: [] },
}: {
  missionId: string;
  slug: string;
  version: number;
  status: string;
  completionRule: unknown;
  screens: EditableScreen[];
  blocking: Problem[];
  advisory: Problem[];
  resources: DraftResource[];
  noteContent: string | null;
  noteDocumentPath: string | null;
  noteDocumentUrl: string | null;
  /** Every route the QA simulator played (validator.ts). */
  paths?: { decisions: string[]; screens: string[]; outcome: string; detail: string | null }[];
  /** The draft's mission definition (F8), for the logic editor and form vocabulary. */
  definition?: MissionDefinition | null;
  /** F7 — this draft's media, signed with the admin's own session. */
  assets?: { rows: { key: string; kind: string; storage_path: string; captions_path: string | null }[]; resolved: ResolvedAsset[] };
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const nextSequence = screens.length
    ? Math.max(...screens.map((s) => s.sequence)) + 10
    : 10;

  const problemsByScreen = new Map<string, Problem[]>();
  for (const p of [...blocking, ...advisory]) {
    if (!p.screen_key) continue;
    problemsByScreen.set(p.screen_key, [...(problemsByScreen.get(p.screen_key) ?? []), p]);
  }

  const def = definition ?? emptyDefinition;
  const vocabulary = {
    screens: screens.map((x) => x.screen_key),
    variables: def.variables.map((v) => v.key),
    unlocks: def.unlocks.map((u) => u.key),
    events: def.events.map((e) => e.key),
    assets: [] as string[],
  };

  return (
    <VocabularyProvider value={vocabulary}>
      {/* ------------------------------------------------------- structure */}
      <section className="mt-[var(--space-xl)]">
        <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-m)]">
          <h2 className="text-[length:var(--text-h3)]">Screens</h2>
          <Button type="button" variant="text" onClick={() => { setAdding((v) => !v); setEditing(null); }}>
            {adding ? "Cancel" : "Add a screen"}
          </Button>
        </div>

        {adding && (
          <div className="mt-[var(--space-m)] rounded-[var(--radius-surface)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-m)]">
            <ScreenEditor
              missionId={missionId}
              slug={slug}
              version={version}
              screen={null}
              nextSequence={nextSequence}
              onDone={() => setAdding(false)}
            />
          </div>
        )}

        {screens.length === 0 ? (
          <p className="mt-[var(--space-m)] text-[var(--color-text-muted)]">
            No screens yet. A mission needs at least one before it can be published.
          </p>
        ) : (
          <ol className="mt-[var(--space-m)] flex flex-col gap-[var(--space-s)]">
            {screens.map((s, i) => {
              const problems = problemsByScreen.get(s.screen_key) ?? [];
              const hasBlocking = problems.some((p) => p.blocking);
              return (
                <li
                  key={s.screen_key}
                  className={cn(
                    "rounded-[var(--radius-surface)] border bg-[var(--color-surface)] p-[var(--space-m)]",
                    hasBlocking ? "border-[var(--color-error)]" : "border-[var(--color-border)]",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-[var(--space-s)]">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <span className="text-[var(--color-text-muted)]">{i + 1}.</span>{" "}
                        {s.title || s.screen_key}
                      </p>
                      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                        {s.screen_key} · {s.type.replace(/_/g, " ")} · position {s.sequence}
                      </p>
                      {problems.map((p) => (
                        <p
                          key={p.code}
                          className={cn(
                            "mt-[var(--space-xs)] text-[length:var(--text-small)]",
                            p.blocking ? "text-[var(--color-error)]" : "text-[var(--color-text-muted)]",
                          )}
                        >
                          {p.blocking ? "Must fix: " : "Note: "}{p.detail}
                        </p>
                      ))}
                    </div>

                    <div className="flex shrink-0 items-center gap-[var(--space-xs)]">
                      <MoveButton missionId={missionId} slug={slug} version={version}
                        screenKey={s.screen_key} direction="up" disabled={i === 0} />
                      <MoveButton missionId={missionId} slug={slug} version={version}
                        screenKey={s.screen_key} direction="down" disabled={i === screens.length - 1} />
                      <button
                        type="button"
                        onClick={() => { setEditing(editing === s.screen_key ? null : s.screen_key); setAdding(false); }}
                        className="min-h-[var(--target-min)] px-[var(--space-xs)] text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4"
                      >
                        {editing === s.screen_key ? "Close" : "Edit"}
                      </button>
                      <DeleteScreenButton missionId={missionId} slug={slug} version={version} screenKey={s.screen_key} />
                    </div>
                  </div>

                  {editing === s.screen_key && (
                    <div className="mt-[var(--space-m)] border-t border-[var(--color-border)] pt-[var(--space-m)]">
                      <ScreenEditor
                        missionId={missionId}
                        slug={slug}
                        version={version}
                        screen={s}
                        nextSequence={nextSequence}
                        onDone={() => setEditing(null)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* ---------------------------------------------------- flow map (§12) */}
      <FlowMap
        screens={screens.map((x) => ({ screen_key: x.screen_key, type: x.type, title: x.title, sequence: x.sequence, configuration: x.configuration }))}
        events={def.events.map((e) => ({ key: e.key, goto: e.goto }))}
        flagged={blocking.map((p) => p.screen_key).filter((k): k is string => Boolean(k))}
      />

      {/* ------------------------------------------------- mission logic (F8) */}
      <DefinitionEditor missionId={missionId} slug={slug} version={version} definition={def} />

      <AssetManager missionId={missionId} slug={slug} version={version} rows={assets.rows} resolved={assets.resolved} />

      {/* --------------------------------------------- Mission Kit, For Parents */}
      <KitEditor
        missionId={missionId} slug={slug} version={version} resources={resources}
      />
      <ParentNoteEditor
        missionId={missionId} slug={slug} version={version}
        content={noteContent} documentPath={noteDocumentPath}
        documentUrl={noteDocumentUrl}
      />

      {/* ------------------------------------------------------- completion */}
      <CompletionRulePanel
        missionId={missionId} slug={slug} version={version} rule={completionRule}
      />

      {/* ----------------------------------------------------------- review */}
      <section className="mt-[var(--space-2xl)]">
        <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-m)]">
          <h2 className="text-[length:var(--text-h3)]">Review</h2>
          <a
            href={`/admin/builder/${slug}/${version}/preview`}
            className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
          >
            Preview as a learner →
          </a>
        </div>
        {blocking.length === 0 ? (
          <p className="mt-[var(--space-xs)] text-[var(--color-text-muted)]">
            Nothing is stopping this version being published.
          </p>
        ) : (
          <>
            <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)]">
              These would stop a learner finishing the mission, so it can&rsquo;t
              be published yet.
            </p>
            <ul className="mt-[var(--space-m)] flex flex-col gap-[var(--space-xs)]">
              {blocking.map((p, i) => (
                <li key={`${p.code}-${i}`} className="text-[length:var(--text-label)]">
                  <strong>{p.screen_key ?? "Mission"}</strong> — {p.detail}
                </li>
              ))}
            </ul>
          </>
        )}
        {advisory.length > 0 && (
          <ul className="mt-[var(--space-m)] flex flex-col gap-[var(--space-xs)]">
            {advisory.map((p, i) => (
              <li key={`${p.code}-${i}`} className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                {p.screen_key ? `${p.screen_key} — ` : ""}{p.detail}
              </li>
            ))}
          </ul>
        )}

        {/*
          BRANCH TESTING — every route the automated QA played through the
          real runtime. A route that does not reach Complete is a blocking
          problem above; this shows the whole picture.
        */}
        {paths.length > 0 && (
          <details className="mt-[var(--space-l)]">
            <summary className="inline-flex min-h-[var(--target-min)] cursor-pointer items-center text-[length:var(--text-label)] font-medium">
              Branch test: {paths.filter((p) => p.outcome === "complete").length} of {paths.length} routes reach Complete
            </summary>
            <ol className="mt-[var(--space-s)] flex flex-col gap-[var(--space-xs)]">
              {paths.map((p, i) => (
                <li key={i} className="text-[length:var(--text-small)]">
                  <strong>{p.outcome === "complete" ? "Completes" : "Does not complete"}</strong>
                  {p.decisions.length ? ` — ${p.decisions.join(" → ")}` : ""}
                  <span className="text-[var(--color-text-muted)]"> · {p.screens.length} screens{p.detail ? ` · ${p.detail}` : ""}</span>
                </li>
              ))}
            </ol>
          </details>
        )}

        <PublishPanel
          missionId={missionId} slug={slug} version={version}
          status={status} canPublish={blocking.length === 0}
        />
      </section>
    </VocabularyProvider>
  );
}

function MoveButton({
  missionId, slug, version, screenKey, direction, disabled,
}: {
  missionId: string; slug: string; version: number;
  screenKey: string; direction: "up" | "down"; disabled: boolean;
}) {
  return (
    <form action={moveScreenAction}>
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="screen_key" value={screenKey} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`Move ${screenKey} ${direction}`}
        className="inline-flex size-[var(--target-min)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" className="size-[16px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {direction === "up" ? <path d="m6 14 6-6 6 6" /> : <path d="m6 10 6 6 6-6" />}
        </svg>
      </button>
    </form>
  );
}

function DeleteScreenButton({
  missionId, slug, version, screenKey,
}: {
  missionId: string; slug: string; version: number; screenKey: string;
}) {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState(deleteScreenAction, initial);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="min-h-[var(--target-min)] px-[var(--space-xs)] text-[length:var(--text-small)] text-[var(--color-text-muted)] underline decoration-[var(--color-border)] underline-offset-4"
      >
        Remove
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-[var(--space-xs)]">
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="screen_key" value={screenKey} />
      {state.error && <span className="text-[length:var(--text-small)] text-[var(--color-error)]">{state.error}</span>}
      <button type="submit" disabled={pending} className="min-h-[var(--target-min)] text-[length:var(--text-small)] font-medium text-[var(--color-error)] underline underline-offset-4">
        {pending ? "Removing…" : "Confirm"}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="min-h-[var(--target-min)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Cancel
      </button>
    </form>
  );
}

function CompletionRulePanel({
  missionId, slug, version, rule,
}: {
  missionId: string; slug: string; version: number; rule: unknown;
}) {
  const [state, action, pending] = useActionState(setCompletionRuleAction, initial);

  return (
    <section className="mt-[var(--space-2xl)] max-w-[46rem]">
      <h2 className="text-[length:var(--text-h3)]">Completion</h2>
      <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)]">
        How the Academy knows the mission is finished. The simplest rule is
        reaching a screen.
      </p>

      <form action={action} className="mt-[var(--space-m)] flex flex-col gap-[var(--space-m)]">
        <input type="hidden" name="missionId" value={missionId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="version" value={version} />

        {state.error && <FormError message={state.error} />}
        {state.ok && <FormNotice message="Completion rule saved." />}

        <Field label="Rule" htmlFor="rule" error={state.fieldErrors?.rule}>
          <textarea
            id="rule"
            name="rule"
            rows={6}
            spellCheck={false}
            defaultValue={
              rule
                ? JSON.stringify(rule, null, 2)
                : `{\n  "type": "screen_reached",\n  "screenKey": ""\n}`
            }
            className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] font-mono text-[length:var(--text-small)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          />
        </Field>

        <div>
          <Button type="submit" isLoading={pending} loadingLabel="Saving…">
            Save completion rule
          </Button>
        </div>
      </form>
    </section>
  );
}

function PublishPanel({
  missionId, slug, version, status, canPublish,
}: {
  missionId: string; slug: string; version: number;
  status: string; canPublish: boolean;
}) {
  const [state, action, pending] = useActionState(setVersionStatusAction, initial);

  return (
    <div className="mt-[var(--space-xl)] rounded-[var(--radius-surface)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-[var(--space-m)]">
      {state.error && <div className="mb-[var(--space-m)]"><FormError message={state.error} /></div>}
      {state.ok && <div className="mb-[var(--space-m)]"><FormNotice message="Status updated." /></div>}

      <p className="wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        New learners get this version. The one it replaces is archived, not
        deleted, so anyone mid-mission carries on.
      </p>

      <div className="mt-[var(--space-m)] flex flex-wrap gap-[var(--space-s)]">
        {status === "draft" && (
          <form action={action}>
            <Hidden missionId={missionId} slug={slug} version={version} status="in_review" />
            <Button type="submit" variant="secondary" isLoading={pending} loadingLabel="Sending…">
              Submit for review
            </Button>
          </form>
        )}
        {status === "in_review" && (
          <form action={action}>
            <Hidden missionId={missionId} slug={slug} version={version} status="draft" />
            <Button type="submit" variant="text" isLoading={pending} loadingLabel="Reopening…">
              Back to draft
            </Button>
          </form>
        )}
        <form action={action}>
          <Hidden missionId={missionId} slug={slug} version={version} status="published" />
          <Button type="submit" disabled={!canPublish} isLoading={pending} loadingLabel="Publishing…">
            Publish
          </Button>
        </form>
      </div>

      {!canPublish && (
        <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Publish is unavailable while there are problems to fix.
        </p>
      )}
    </div>
  );
}

function Hidden({
  missionId, slug, version, status,
}: { missionId: string; slug: string; version: number; status: string }) {
  return (
    <>
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="status" value={status} />
    </>
  );
}
