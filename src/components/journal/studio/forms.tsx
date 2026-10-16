"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import {
  deleteCategoryAction,
  newArticleAction,
  saveCategoryAction,
  setRoleAction,
  type JournalState,
} from "@/features/journal/actions";
import { prepareImport, sendImport } from "@/features/journal/import-client";
import { ActionButton } from "./action-button";

/** One click: an untitled draft opens in the editor (D-136). */
export function NewArticleButton() {
  const [state, dispatch, pending] = useActionState(newArticleAction, {} as JournalState);
  return (
    <form action={dispatch} className="flex flex-col gap-[var(--space-xs)]">
      <div>
        <Button type="submit" isLoading={pending} loadingLabel="Opening…">New article</Button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

const pickBtn =
  "inline-flex min-h-[var(--target-min)] cursor-pointer items-center gap-[var(--space-s)] rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-l)] font-medium hover:bg-[var(--color-surface-raised)] hover:border-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]";

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

/**
 * MEDIUM IMPORT (D-129): a real button to choose files, what was chosen, an
 * upload with progress, then the report. Imported posts are always drafts.
 */
export function ImportForm() {
  const uid = useId();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [phase, setPhase] = useState<"idle" | "preparing" | "uploading" | "processing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = phase === "preparing" || phase === "uploading" || phase === "processing";

  const start = async () => {
    setError(null);
    setPhase("preparing");
    const prepared = await prepareImport(files);
    if ("error" in prepared) {
      setPhase("idle");
      setError(prepared.error);
      return;
    }
    setPhase("uploading");
    setProgress(0);
    const result = await sendImport(prepared.files, includeDrafts, (f) => {
      setProgress(f);
      if (f >= 1) setPhase("processing");
    });
    if ("error" in result) {
      setPhase("idle");
      setError(result.error);
      return;
    }
    setPhase("done");
    router.push(`/editorial/import/${result.runId}`);
  };

  return (
    <div className="flex max-w-[40rem] flex-col gap-[var(--space-l)]">
      <div className="flex flex-col gap-[var(--space-s)]">
        <span id={`${uid}-l`} className="text-[length:var(--text-label)] font-medium">Medium export</span>
        <p id={`${uid}-h`} className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          Accepted: the <strong>.zip</strong> Medium emails you, or one or more post <strong>.html</strong> files from its posts folder.
        </p>
        <div>
          <button
            type="button"
            className={pickBtn}
            aria-describedby={`${uid}-l ${uid}-h`}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <span aria-hidden="true">⇪</span> {files.length ? "Choose different files" : "Choose files"}
          </button>
          <input
            ref={inputRef}
            type="file"
            hidden
            aria-label="Choose a file"
            multiple
            accept=".zip,.html,.htm,application/zip,text/html"
            tabIndex={-1}
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []));
              setError(null);
              setPhase("idle");
              e.target.value = "";
            }}
          />
        </div>
        {files.length > 0 ? (
          <ul aria-label="Chosen files" className="flex flex-col gap-[var(--space-xs)] rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)]">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex flex-wrap items-center justify-between gap-[var(--space-s)] text-[length:var(--text-small)]">
                <span><span aria-hidden="true">✓ </span>{f.name} <span className="text-[var(--color-text-muted)]">· {size(f.size)}</span></span>
                {!busy && (
                  <button type="button" className="min-h-[var(--target-min)] underline underline-offset-4" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}>
                    Remove<span className="sr-only"> {f.name}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">No files chosen yet.</p>
        )}
      </div>

      <label className="flex min-h-[var(--target-min)] items-center gap-[var(--space-s)]">
        <input type="checkbox" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} disabled={busy} className="h-5 w-5 accent-[var(--color-primary)]" />
        Also import my unpublished Medium drafts
      </label>

      {busy && (
        <div role="status" aria-live="polite" className="flex flex-col gap-[var(--space-xs)]">
          <p className="text-[length:var(--text-small)]">
            {phase === "preparing" ? "Reading the export…" : phase === "uploading" ? `Uploading — ${Math.round(progress * 100)}%` : "Importing posts… this can take a minute for a large export."}
          </p>
          <div
            role="progressbar"
            aria-label="Import progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={phase === "uploading" ? Math.round(progress * 100) : undefined}
            aria-valuetext={phase === "processing" ? "Importing posts" : undefined}
            className="h-2 w-full max-w-[24rem] overflow-hidden rounded-full bg-[var(--color-surface-raised)]"
          >
            <div className={`h-full bg-[var(--color-primary)] ${phase === "processing" ? "w-full animate-pulse" : ""}`} style={phase === "uploading" ? { width: `${Math.round(progress * 100)}%` } : undefined} />
          </div>
        </div>
      )}

      <div>
        <Button type="button" onClick={start} disabled={files.length === 0 || busy} isLoading={busy} loadingLabel="Importing…">
          Import as drafts
        </Button>
      </div>
      {error && <div role="alert"><FormError message={error} /></div>}
      <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">Nothing is published. Each post becomes a draft you can edit and publish when you&rsquo;re ready.</p>
    </div>
  );
}

export function RoleForm() {
  const uid = useId();
  const [state, dispatch, pending] = useActionState(setRoleAction, {} as JournalState);
  return (
    <form action={dispatch} className="flex max-w-[40rem] flex-col gap-[var(--space-m)]">
      <Field label="Account email" htmlFor={`${uid}-e`} hint="They must already have a WLA account." error={state.fieldErrors?.email}>
        <Input id={`${uid}-e`} name="email" type="email" required invalid={Boolean(state.fieldErrors?.email)} />
      </Field>
      <Field label="Role" htmlFor={`${uid}-r`} error={state.fieldErrors?.role}>
        <select id={`${uid}-r`} name="role" className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
          <option value="writer">Writer — writes and edits their own articles</option>
          <option value="editor">Editor — every article; publishes, schedules, archives</option>
        </select>
      </Field>
      <fieldset className="flex flex-wrap gap-[var(--space-l)]">
        <legend className="mb-[var(--space-xs)] text-[length:var(--text-label)] font-medium">Change</legend>
        <label className="flex min-h-[var(--target-min)] items-center gap-[var(--space-s)]"><input type="radio" name="grant" value="1" defaultChecked className="h-5 w-5 accent-[var(--color-primary)]" /> Grant</label>
        <label className="flex min-h-[var(--target-min)] items-center gap-[var(--space-s)]"><input type="radio" name="grant" value="0" className="h-5 w-5 accent-[var(--color-primary)]" /> Remove</label>
      </fieldset>
      <div><Button type="submit" isLoading={pending} loadingLabel="Saving…">Apply</Button></div>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
    </form>
  );
}

export function CategoryForm({ category }: { category?: { id: string; name: string; slug: string; description: string | null; sort_order: number } }) {
  const uid = useId();
  const [state, dispatch, pending] = useActionState(saveCategoryAction, {} as JournalState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !category) ref.current?.reset();
  }, [state, category]);
  return (
    <form ref={ref} action={dispatch} className="grid gap-[var(--space-m)] md:grid-cols-2">
      {category && <input type="hidden" name="id" value={category.id} />}
      <Field label="Name" htmlFor={`${uid}-n`} error={state.fieldErrors?.name}>
        <Input id={`${uid}-n`} name="name" defaultValue={category?.name} maxLength={80} required />
      </Field>
      <Field label="URL slug" htmlFor={`${uid}-s`} hint="Leave empty to make one from the name." error={state.fieldErrors?.slug}>
        <Input id={`${uid}-s`} name="slug" defaultValue={category?.slug} maxLength={120} />
      </Field>
      <Field label="Description" htmlFor={`${uid}-d`} error={state.fieldErrors?.description}>
        <Input id={`${uid}-d`} name="description" defaultValue={category?.description ?? ""} maxLength={300} />
      </Field>
      <Field label="Order" htmlFor={`${uid}-o`} hint="Lower numbers come first." error={state.fieldErrors?.sort_order}>
        <Input id={`${uid}-o`} name="sort_order" type="number" min={0} max={999} defaultValue={category?.sort_order ?? 0} />
      </Field>
      <div className="flex flex-wrap items-center gap-[var(--space-m)] md:col-span-2">
        <Button type="submit" variant={category ? "secondary" : "primary"} isLoading={pending} loadingLabel="Saving…">{category ? "Save" : "Add category"}</Button>
        <FormError message={state.error} />
        <FormNotice message={state.notice} />
      </div>
    </form>
  );
}

export function DeleteCategoryButton({ id, name }: { id: string; name: string }) {
  return (
    <ActionButton
      action={deleteCategoryAction}
      fields={{ id }}
      label={`Remove ${name}`}
      variant="text"
      confirm={{ title: `Remove “${name}”?`, body: <p>Only possible when no article version uses it.</p>, confirmLabel: "Remove", destructive: true }}
    />
  );
}
