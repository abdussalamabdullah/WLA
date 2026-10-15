import Link from "next/link";

import { AUDIT_LABEL, FIELD_LABEL, REVISION_LABEL, SCHEDULE_FAILURE } from "@/features/journal/status";
import type { JournalAuditRow, JournalChangeRow, JournalDecisionRow, JournalRevisionRow } from "@/types/database";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const muted = "text-[length:var(--text-small)] text-[var(--color-text-muted)]";

/**
 * REVISION HISTORY AND ATTRIBUTION (D-126, D-128). Every version, who changed
 * what in it, every review decision with the exact version it applied to,
 * and the workflow audit trail. Read-only.
 */
export function History({
  articleId,
  revisions,
  changes,
  decisions,
  audit,
  nameOf,
}: {
  articleId: string;
  revisions: JournalRevisionRow[];
  changes: JournalChangeRow[];
  decisions: JournalDecisionRow[];
  audit: JournalAuditRow[];
  nameOf: (id: string | null) => string;
}) {
  const numberOf = new Map(revisions.map((r) => [r.id, r.number]));
  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <section aria-labelledby="versions">
        <h3 id="versions" className="text-[length:var(--text-h3)]">Versions</h3>
        <ol className="mt-[var(--space-s)] flex flex-col gap-[var(--space-s)]">
          {revisions.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-[var(--space-s)] border-b border-[var(--color-border)] pb-[var(--space-s)]">
              <span>
                <span className="font-medium">Version {r.number}</span> · {REVISION_LABEL[r.state]}
                <span className={`block ${muted}`}>Last saved {when(r.updated_at)} by {nameOf(r.updated_by)}</span>
              </span>
              <Link href={`/editorial/articles/${articleId}/preview?revision=${r.id}`} className="inline-flex min-h-[var(--target-min)] items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
                Preview version {r.number}
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {decisions.length > 0 && (
        <section aria-labelledby="decisions">
          <h3 id="decisions" className="text-[length:var(--text-h3)]">Review decisions</h3>
          <ol className="mt-[var(--space-s)] flex flex-col gap-[var(--space-m)]">
            {decisions.map((d) => (
              <li key={d.id}>
                <p>
                  <span className="font-medium">{nameOf(d.reviewer_id)}</span> {d.decision === "approve" ? "approved" : "requested changes to"} version {numberOf.get(d.revision_id) ?? "?"}
                </p>
                <p className={muted}>{when(d.decided_at)} · content fingerprint {d.content_hash.slice(0, 10)}</p>
                {d.note && <p className="mt-[var(--space-xs)] whitespace-pre-line">{d.note}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="changes">
        <h3 id="changes" className="text-[length:var(--text-h3)]">Who changed what</h3>
        {changes.length === 0 ? (
          <p className={`mt-[var(--space-s)] ${muted}`}>No saved changes yet.</p>
        ) : (
          <ol className="mt-[var(--space-s)] flex flex-col gap-[var(--space-xs)]">
            {changes.slice(0, 50).map((c) => (
              <li key={c.id}>
                {nameOf(c.actor_id)} changed {c.changed_fields.map((f) => FIELD_LABEL[f] ?? f).join(", ")} in version {numberOf.get(c.revision_id) ?? "?"}{" "}
                <span className={muted}>· {when(c.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="audit">
        <h3 id="audit" className="text-[length:var(--text-h3)]">Activity</h3>
        <ol className="mt-[var(--space-s)] flex flex-col gap-[var(--space-xs)]">
          {audit.map((a) => {
            const reason = a.action === "schedule_failed" ? SCHEDULE_FAILURE[String((a.detail as { reason?: string })?.reason)] : null;
            return (
              <li key={a.id}>
                {a.actor_id ? nameOf(a.actor_id) : "WLA"} {AUDIT_LABEL[a.action] ?? a.action.replace(/_/g, " ")}
                {a.revision_id && numberOf.has(a.revision_id) ? ` (version ${numberOf.get(a.revision_id)})` : ""}
                {reason ? `: ${reason}` : ""} <span className={muted}>· {when(a.at)}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
