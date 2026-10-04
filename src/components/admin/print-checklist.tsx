import type { ChecklistRow } from "@/features/admin/print-checklist";

/** Plan §12 — what the family will print, and what in the mission needs it. */
export function PrintChecklist({ rows, missing }: { rows: ChecklistRow[]; missing: { title: string; usedBy: string[] }[] }) {
  return (
    <section aria-labelledby="print-checklist" className="mt-[var(--space-2xl)]">
      <h2 id="print-checklist" className="text-[length:var(--text-h3)]">Print checklist</h2>
      <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Every Mission Kit resource, whether a family can print it, and what in this mission depends on it.
      </p>
      {missing.length > 0 && (
        <ul className="mt-[var(--space-s)] flex flex-col gap-[var(--space-xs)]">
          {missing.map((m) => (
            <li key={m.title} className="text-[length:var(--text-small)] text-[var(--color-error)]">
              Missing from the Kit: <strong>{m.title}</strong> — {m.usedBy.join("; ")}
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 ? (
        <p className="mt-[var(--space-s)] text-[length:var(--text-small)]">No Kit resources yet.</p>
      ) : (
        <ul className="mt-[var(--space-m)] border-t border-[var(--color-border)]">
          {rows.map((r) => (
            <li key={r.title} className="border-b border-[var(--color-border)] py-[var(--space-s)]">
              <p className="font-medium">
                {r.title} <span className="font-normal text-[var(--color-text-muted)]">· {r.type} · {r.canPrint ? "printable" : "not printable"}</span>
              </p>
              {r.usedBy.length > 0 && <p className="text-[length:var(--text-small)]">Used by: {r.usedBy.join("; ")}</p>}
              {r.notes.map((n) => <p key={n} className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{n}</p>)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
