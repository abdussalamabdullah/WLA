"use client";

import {
  createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type FormEvent, type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "./dialog";
import { Button } from "@/components/ui/button";

/**
 * UNSAVED-CHANGES PROTECTION for the authoring pages (D-118).
 *
 * The builder has several independent forms, each with its own Save. Before
 * this, closing an editor, opening another screen, or following a link threw
 * away whatever had been typed, silently. Now:
 *
 *   - each form reports whether it differs from what was last saved
 *     (`useDirtyForm`), by comparing its submitted fields with a snapshot;
 *   - closing or switching editors asks first (`requestDiscard`);
 *   - following any link out of the page asks first (a document-level
 *     capture listener, so the shared admin sidebar is covered too);
 *   - reloading or closing the tab triggers the browser's own warning.
 *
 * Nothing autosaves. A form becomes clean only after a SUCCESSFUL save of the
 * content it held when submitted, or an explicit discard. A failed save
 * leaves it dirty. The browser's Back button cannot be intercepted reliably
 * in a client-routed app; that gap is documented rather than papered over.
 */

type Ctx = {
  setDirty: (id: string, label: string | null) => void;
  /** Run `proceed` now if none of `ids` is dirty; otherwise ask first. */
  requestDiscard: (ids: string[], proceed: () => void) => void;
  dirtyIds: string[];
};

const UnsavedCtx = createContext<Ctx>({
  setDirty: () => {},
  requestDiscard: (_ids, proceed) => proceed(),
  dirtyIds: [],
});

export const useUnsavedChanges = () => useContext(UnsavedCtx);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirtyMap] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState<{ labels: string[]; proceed: () => void } | null>(null);
  const router = useRouter();

  const setDirty = useCallback((id: string, label: string | null) => {
    setDirtyMap((m) => {
      if (label === null) {
        if (!(id in m)) return m;
        const next = { ...m };
        delete next[id];
        return next;
      }
      return m[id] === label ? m : { ...m, [id]: label };
    });
  }, []);

  const requestDiscard = useCallback((ids: string[], proceed: () => void) => {
    const labels = ids.filter((id) => id in dirty).map((id) => dirty[id]);
    if (labels.length === 0) proceed();
    else setAsk({ labels, proceed });
  }, [dirty]);

  const anyDirty = Object.keys(dirty).length > 0;

  // Reload, close the tab, or leave for another site.
  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyDirty]);

  // Any same-origin link click while something is unsaved: ask first.
  useEffect(() => {
    if (!anyDirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return; // beforeunload covers it
      // An anchor on this page (the section index) loses nothing.
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      e.preventDefault();
      e.stopPropagation();
      setAsk({
        labels: Object.values(dirty),
        proceed: () => {
          setDirtyMap({});
          router.push(url.pathname + url.search + url.hash);
        },
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [anyDirty, dirty, router]);

  const value = useMemo(() => ({ setDirty, requestDiscard, dirtyIds: Object.keys(dirty) }), [setDirty, requestDiscard, dirty]);

  return (
    <UnsavedCtx.Provider value={value}>
      {children}
      <Dialog open={ask !== null} onClose={() => setAsk(null)} title="Discard unsaved changes?" role="alertdialog">
        <p className="wla-measure">
          {ask && ask.labels.length === 1
            ? <>You haven&rsquo;t saved your changes to <strong>{ask.labels[0]}</strong>.</>
            : <>You haven&rsquo;t saved your changes to:</>}
        </p>
        {ask && ask.labels.length > 1 && (
          <ul className="mt-[var(--space-xs)] list-disc pl-[var(--space-l)]">
            {ask.labels.map((l) => <li key={l}>{l}</li>)}
          </ul>
        )}
        <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          If you continue, they will be lost.
        </p>
        <div className="mt-[var(--space-l)] flex flex-wrap gap-[var(--space-m)]">
          {/* First, so it receives focus: keeping work is the safe default. */}
          <Button type="button" onClick={() => setAsk(null)}>Keep editing</Button>
          <Button
            type="button"
            variant="text"
            className="text-[color:var(--color-error)]"
            onClick={() => { const p = ask?.proceed; setAsk(null); p?.(); }}
          >
            Discard changes
          </Button>
        </div>
      </Dialog>
    </UnsavedCtx.Provider>
  );
}

/** The submitted fields of a form, as one comparable string. */
export function snapshotForm(form: HTMLFormElement): string {
  const out: [string, string][] = [];
  for (const el of Array.from(form.elements) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[]) {
    if (!el.name || (el as HTMLInputElement).disabled) continue;
    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox" || el.type === "radio") out.push([el.name, `${el.value}:${el.checked}`]);
      else if (el.type === "file") out.push([el.name, Array.from(el.files ?? []).map((f) => f.name).join("|")]);
      else if (el.type === "submit" || el.type === "button") continue;
      else out.push([el.name, el.value]);
    } else {
      out.push([el.name, el.value]);
    }
  }
  return JSON.stringify(out);
}

/**
 * Track one form. Attach `ref` to the <form>, call `saved()` when its action
 * reports success. `id` is stable per form; `label` names it for the warning.
 */
export function useDirtyForm(id: string, label: string) {
  const { setDirty } = useUnsavedChanges();
  const ref = useRef<HTMLFormElement>(null);
  const baseline = useRef<string | null>(null);
  const submitted = useRef<string | null>(null);
  const [dirty, setLocal] = useState(false);
  const labelRef = useRef(label);
  useEffect(() => { labelRef.current = label; }, [label]);

  const recheck = useCallback(() => {
    const form = ref.current;
    if (!form || baseline.current === null) return;
    const d = snapshotForm(form) !== baseline.current;
    setLocal(d);
    setDirty(id, d ? labelRef.current : null);
  }, [id, setDirty]);

  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    baseline.current = snapshotForm(form);
    const later = () => window.setTimeout(recheck, 0);
    const onSubmit = () => { submitted.current = snapshotForm(form); };
    form.addEventListener("input", later);
    form.addEventListener("change", later);
    form.addEventListener("click", later);
    form.addEventListener("submit", onSubmit, true);
    return () => {
      form.removeEventListener("input", later);
      form.removeEventListener("change", later);
      form.removeEventListener("click", later);
      form.removeEventListener("submit", onSubmit, true);
      setDirty(id, null);
    };
  }, [id, recheck, setDirty]);

  // Controlled fields (the JSON behind the generated forms) change on render.
  useEffect(() => { recheck(); });

  /**
   * The save succeeded: what was submitted is now the saved state. File
   * pickers are emptied (the file is uploaded; keeping it selected would
   * upload it again). `reset` empties the whole form — for "add another"
   * forms that stay open after adding.
   */
  const saved = useCallback((opts: { reset?: boolean } = {}) => {
    const form = ref.current;
    if (!form) return;
    if (opts.reset) {
      form.reset();
      baseline.current = snapshotForm(form);
    } else {
      for (const f of Array.from(form.querySelectorAll<HTMLInputElement>("input[type=file]"))) f.value = "";
      const sent = submitted.current ? (JSON.parse(submitted.current) as [string, string][]) : null;
      const fileNames = new Set(Array.from(form.querySelectorAll<HTMLInputElement>("input[type=file]")).map((f) => f.name));
      baseline.current = sent ? JSON.stringify(sent.map(([k, v]) => [k, fileNames.has(k) ? "" : v])) : snapshotForm(form);
    }
    submitted.current = null;
    recheck();
  }, [recheck]);

  return { ref, dirty, saved };
}

/**
 * Submit a form to its action WITHOUT React's automatic reset (D-118).
 *
 * React 19 resets a `<form action={…}>`'s uncontrolled fields after every
 * submission (`requestFormReset` in `startHostTransition`), whatever the
 * action returned — so a FAILED save wiped what the author had typed. Calling
 * the same action dispatcher inside `startTransition` keeps the pending state
 * and the server behaviour, but not the reset. Keep `action={…}` on the form
 * as well: this handler prevents it from running when JavaScript is present.
 */
export function useSubmitWithoutReset(dispatch: (formData: FormData) => void, before?: () => void) {
  return useCallback((e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    before?.();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  }, [dispatch, before]);
}

/** "Unsaved changes", in words — never colour alone. */
export function UnsavedNote({ dirty }: { dirty: boolean }) {
  return (
    <span role="status" className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
      {dirty ? "Unsaved changes" : ""}
    </span>
  );
}
