"use client";

import { useActionState, useId, useState } from "react";
import {
  saveKitResourceAction,
  deleteKitResourceAction,
  moveKitResourceAction,
  saveParentNoteAction,
  type KitState,
} from "@/features/admin/kit-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError, FormNotice } from "@/components/ui/field";
import { ParentNote } from "@/components/academy/parent-note";

const initial: KitState = {};

export type DraftResource = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  storage_path: string;
  can_view: boolean;
  can_print: boolean;
  can_download: boolean;
  sort_order: number;
  /** Short-lived link signed with the admin's own session; null if missing. */
  file_url: string | null;
};

const TYPES = [
  { value: "pdf", label: "PDF" },
  { value: "image", label: "Image" },
  { value: "document", label: "Document" },
  { value: "other", label: "Other" },
];

/**
 * MISSION KIT AUTHORING — brief §4.
 *
 * Mission Kit is what WLA GIVES (Architecture §7). It is not the Mission
 * Trail, and nothing a child produces appears here — which is why this editor
 * only ever writes to `mission_resources`.
 */
export function KitEditor({
  missionId,
  slug,
  version,
  resources,
}: {
  missionId: string;
  slug: string;
  version: number;
  resources: DraftResource[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const nextSort = resources.length
    ? Math.max(...resources.map((r) => r.sort_order)) + 10
    : 10;

  return (
    <section className="mt-[var(--space-2xl)]">
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-m)]">
        <div>
          <h2 className="text-[length:var(--text-h3)]">Mission Kit</h2>
          <p className="mt-[2px] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Printables and resources this mission gives the child.
          </p>
        </div>
        <Button type="button" variant="text" onClick={() => { setAdding((v) => !v); setEditing(null); }}>
          {adding ? "Cancel" : "Add a resource"}
        </Button>
      </div>

      {adding && (
        <div className="mt-[var(--space-m)] rounded-[var(--radius-surface)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-m)]">
          <ResourceForm
            missionId={missionId} slug={slug} version={version}
            resource={null} nextSort={nextSort} onDone={() => setAdding(false)}
          />
        </div>
      )}

      {resources.length === 0 ? (
        <p className="mt-[var(--space-m)] text-[var(--color-text-muted)]">
          No resources yet.
        </p>
      ) : (
        <ol className="mt-[var(--space-m)] flex flex-col gap-[var(--space-s)]">
          {resources.map((r, i) => (
            <li key={r.id} className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
              <div className="flex flex-wrap items-start justify-between gap-[var(--space-s)]">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="text-[var(--color-text-muted)]">{i + 1}.</span> {r.title}
                  </p>
                  <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                    {r.type.toUpperCase()}
                    {" · "}
                    {[r.can_view && "view", r.can_print && "print", r.can_download && "download"]
                      .filter(Boolean).join(" · ") || "no access"}
                  </p>
                  {r.description && (
                    <p className="mt-[2px] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                      {r.description}
                    </p>
                  )}
                  {r.file_url ? (
                    <a
                      href={r.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4"
                    >
                      Open file<span className="sr-only"> {r.title} (opens in a new tab)</span>
                    </a>
                  ) : (
                    <p className="mt-[2px] text-[length:var(--text-small)] text-[var(--color-error)]">
                      The file can&rsquo;t be found. Replace it before publishing.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-[var(--space-xs)]">
                  <MoveResource missionId={missionId} slug={slug} version={version}
                    id={r.id} direction="up" disabled={i === 0} />
                  <MoveResource missionId={missionId} slug={slug} version={version}
                    id={r.id} direction="down" disabled={i === resources.length - 1} />
                  <button
                    type="button"
                    onClick={() => { setEditing(editing === r.id ? null : r.id); setAdding(false); }}
                    className="min-h-[var(--target-min)] px-[var(--space-xs)] text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4"
                  >
                    {editing === r.id ? "Close" : "Edit"}
                  </button>
                  <RemoveResource missionId={missionId} slug={slug} version={version} id={r.id} />
                </div>
              </div>

              {editing === r.id && (
                <div className="mt-[var(--space-m)] border-t border-[var(--color-border)] pt-[var(--space-m)]">
                  <ResourceForm
                    missionId={missionId} slug={slug} version={version}
                    resource={r} nextSort={nextSort} onDone={() => setEditing(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ResourceForm({
  missionId, slug, version, resource, nextSort, onDone,
}: {
  missionId: string; slug: string; version: number;
  resource: DraftResource | null; nextSort: number; onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveKitResourceAction, initial);
  const err = (k: string) => state.fieldErrors?.[k];
  /*
   * Unique per form. This form can be open beside the screen editor, which
   * also has "title" and "type" fields; shared ids left the second pair with
   * no label (found by the rendered a11y audit).
   */
  const uid = useId();
  const id = (field: string) => `resource-${uid}-${field}`;

  return (
    <form action={action} className="flex flex-col gap-[var(--space-m)]">
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      {resource && <input type="hidden" name="resourceId" value={resource.id} />}
      {resource && <input type="hidden" name="existingPath" value={resource.storage_path} />}

      {state.error && <FormError message={state.error} />}
      {state.ok && <FormNotice message="Resource saved." />}

      <div className="grid gap-[var(--space-m)] sm:grid-cols-2">
        <Field label="Name" htmlFor={id("title")} error={err("title")}>
          <Input id={id("title")} name="title" required defaultValue={resource?.title ?? ""}
            placeholder="Six Names Case Board" />
        </Field>
        <Field label="Position" htmlFor={id("sort_order")} error={err("sort_order")}>
          <Input id={id("sort_order")} name="sort_order" type="number"
            defaultValue={resource?.sort_order ?? nextSort} />
        </Field>
      </div>

      <Field label="Description" htmlFor={id("description")} error={err("description")}
        hint="Optional. What it is and when the child needs it.">
        <Input id={id("description")} name="description" defaultValue={resource?.description ?? ""} />
      </Field>

      <Field label="Type" htmlFor={id("type")} error={err("type")}>
        <select
          id={id("type")} name="type" defaultValue={resource?.type ?? "pdf"}
          className="min-h-[var(--target-min)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)] text-[length:var(--text-label)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        >
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>

      <Field
        label={resource ? "Replace the file" : "File"}
        htmlFor={id("file")}
        error={err("file")}
        hint={resource ? "Leave empty to keep the current file." : "Up to 20 MB."}
      >
        <input
          id={id("file")} name="file" type="file"
          className="min-h-[var(--target-min)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-xs)] text-[length:var(--text-small)] file:mr-[var(--space-s)] file:rounded-[var(--radius-control)] file:border-0 file:bg-[var(--color-surface-sage)] file:px-[var(--space-s)] file:py-[6px] file:text-[length:var(--text-small)]"
        />
      </Field>

      <fieldset className="flex flex-wrap gap-[var(--space-m)]">
        <legend className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          What the child can do with it
        </legend>
        {[["can_view", "View"], ["can_print", "Print"], ["can_download", "Download"]].map(([n, l]) => (
          <label key={n} className="inline-flex min-h-[var(--target-min)] items-center gap-[var(--space-xs)] text-[length:var(--text-label)]">
            <input type="checkbox" name={n}
              defaultChecked={resource ? (resource as unknown as Record<string, boolean>)[n] : true}
              className="size-[18px]" />
            {l}
          </label>
        ))}
      </fieldset>

      <div className="flex gap-[var(--space-s)]">
        <Button type="submit" isLoading={pending} loadingLabel="Saving…">
          {resource ? "Save resource" : "Add resource"}
        </Button>
        <Button type="button" variant="text" onClick={onDone}>Done</Button>
      </div>
    </form>
  );
}

function MoveResource({
  missionId, slug, version, id, direction, disabled,
}: {
  missionId: string; slug: string; version: number;
  id: string; direction: "up" | "down"; disabled: boolean;
}) {
  return (
    <form action={moveKitResourceAction}>
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="resourceId" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button type="submit" disabled={disabled} aria-label={`Move resource ${direction}`}
        className="inline-flex size-[var(--target-min)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border)] disabled:opacity-40">
        <svg viewBox="0 0 24 24" className="size-[16px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {direction === "up" ? <path d="m6 14 6-6 6 6" /> : <path d="m6 10 6 6 6-6" />}
        </svg>
      </button>
    </form>
  );
}

function RemoveResource({
  missionId, slug, version, id,
}: { missionId: string; slug: string; version: number; id: string }) {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState(deleteKitResourceAction, initial);

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)}
        className="min-h-[var(--target-min)] px-[var(--space-xs)] text-[length:var(--text-small)] text-[var(--color-text-muted)] underline decoration-[var(--color-border)] underline-offset-4">
        Remove
      </button>
    );
  }
  return (
    <form action={action} className="flex items-center gap-[var(--space-xs)]">
      <input type="hidden" name="missionId" value={missionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="resourceId" value={id} />
      {state.error && <span className="text-[length:var(--text-small)] text-[var(--color-error)]">{state.error}</span>}
      <button type="submit" disabled={pending}
        className="min-h-[var(--target-min)] text-[length:var(--text-small)] font-medium text-[var(--color-error)] underline underline-offset-4">
        {pending ? "Removing…" : "Confirm"}
      </button>
      <button type="button" onClick={() => setArmed(false)}
        className="min-h-[var(--target-min)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Cancel
      </button>
    </form>
  );
}

/**
 * PARENT NOTE AUTHORING — brief §5.
 *
 * Adult guidance (Architecture §8), not a parent dashboard and not mission
 * content. Text is required; a PDF is optional and, where present, is what
 * `/parents` serves.
 */
export function ParentNoteEditor({
  missionId, slug, version, content, documentPath, documentUrl,
}: {
  missionId: string; slug: string; version: number;
  content: string | null; documentPath: string | null; documentUrl: string | null;
}) {
  const [state, action, pending] = useActionState(saveParentNoteAction, initial);
  const [text, setText] = useState(content ?? "");
  const [previewing, setPreviewing] = useState(false);

  return (
    <section className="mt-[var(--space-2xl)] max-w-[46rem]">
      <h2 className="text-[length:var(--text-h3)]">For Parents</h2>
      <p className="mt-[2px] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        A short note for the adult helping. Not shown to the child.
      </p>

      <form action={action} className="mt-[var(--space-m)] flex flex-col gap-[var(--space-m)]">
        <input type="hidden" name="missionId" value={missionId} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="version" value={version} />
        {documentPath && <input type="hidden" name="existingPath" value={documentPath} />}

        {state.error && <FormError message={state.error} />}
        {state.ok && <FormNotice message="Parent note saved." />}

        <Field label="Note" htmlFor="content" error={state.fieldErrors?.content}
          hint="Markdown headings and lists are fine.">
          <textarea
            id="content" name="content" rows={12} required
            value={text} onChange={(e) => setText(e.target.value)}
            className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] text-[length:var(--text-label)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          />
        </Field>

        <Field label="Printable note (optional)" htmlFor="document"
          error={state.fieldErrors?.document}
          hint={documentPath ? "A document is attached. Choose a file to replace it." : "If you add one, For Parents opens it instead of the text."}>
          <input id="document" name="document" type="file" accept="application/pdf"
            className="min-h-[var(--target-min)] w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-xs)] text-[length:var(--text-small)] file:mr-[var(--space-s)] file:rounded-[var(--radius-control)] file:border-0 file:bg-[var(--color-surface-sage)] file:px-[var(--space-s)] file:py-[6px] file:text-[length:var(--text-small)]" />
        </Field>

        {documentUrl && (
          <a
            href={documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[var(--target-min)] items-center self-start text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4"
          >
            Open the attached document<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}

        <div className="flex flex-wrap gap-[var(--space-s)]">
          <Button type="submit" isLoading={pending} loadingLabel="Saving…">Save parent note</Button>
          <Button type="button" variant="text" aria-expanded={previewing}
            aria-controls="parent-note-preview" onClick={() => setPreviewing((v) => !v)}>
            {previewing ? "Hide preview" : "Preview"}
          </Button>
        </div>
      </form>

      {/*
        The same component For Parents renders, so the preview cannot drift
        from what a parent sees. Shows the text as typed, saved or not.
      */}
      {previewing && (
        <div id="parent-note-preview"
          className="mt-[var(--space-l)] rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-background)] p-[var(--space-l)]">
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Preview — as a parent sees it{documentPath ? " if the document can't be opened" : ""}
          </p>
          <h3 className="mt-[var(--space-s)] text-[length:var(--text-h3)]">For Parents</h3>
          <div className="mt-[var(--space-m)]">
            <ParentNote content={text.trim() || null} />
          </div>
        </div>
      )}
    </section>
  );
}
