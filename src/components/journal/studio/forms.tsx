"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Field, FormError, FormNotice, Input } from "@/components/ui/field";
import {
  createArticleAction,
  deleteCategoryAction,
  importMediumAction,
  saveCategoryAction,
  setRoleAction,
  type JournalState,
} from "@/features/journal/actions";
import { ActionButton } from "./action-button";

export function NewArticleForm() {
  const uid = useId();
  const [state, dispatch, pending] = useActionState(createArticleAction, {} as JournalState);
  return (
    <form action={dispatch} className="flex flex-wrap items-end gap-[var(--space-s)]">
      <div className="min-w-[14rem] flex-1">
        <Field label="Working title" htmlFor={`${uid}-t`} error={state.fieldErrors?.title}>
          <Input id={`${uid}-t`} name="title" maxLength={200} required invalid={Boolean(state.fieldErrors?.title)} />
        </Field>
      </div>
      <Button type="submit" isLoading={pending} loadingLabel="Creating…">New article</Button>
      <div className="basis-full"><FormError message={state.error} /></div>
    </form>
  );
}

export function ImportForm() {
  const uid = useId();
  const [state, dispatch, pending] = useActionState(importMediumAction, {} as JournalState);
  return (
    <form action={dispatch} className="flex max-w-[40rem] flex-col gap-[var(--space-l)]">
      <Field
        label="Medium export"
        htmlFor={`${uid}-f`}
        hint="The .zip from Medium → Settings → Download your information, or one or more post .html files from its posts folder. Up to 50 MB."
        error={state.fieldErrors?.files}
      >
        <input id={`${uid}-f`} name="files" type="file" multiple accept=".zip,.html,.htm,application/zip,text/html" className="min-h-[var(--target-min)]" />
      </Field>
      <label className="flex min-h-[var(--target-min)] items-center gap-[var(--space-s)]">
        <input type="checkbox" name="includeDrafts" value="1" className="h-5 w-5 accent-[var(--color-primary)]" />
        Include unpublished Medium drafts
      </label>
      <div>
        <Button type="submit" isLoading={pending} loadingLabel="Importing… this can take a minute">Import</Button>
      </div>
      <FormError message={state.error} />
    </form>
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
          <option value="reviewer">Reviewer — approves or requests changes when assigned</option>
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
