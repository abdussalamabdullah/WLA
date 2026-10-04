import type { MissionEvidenceRow } from "@/types/database";

/**
 * MISSION TRAIL EVIDENCE — Architecture §15, Brief §27, UI/UX §44.
 *
 * THE DISTINCTION THAT MUST STAY VISIBLE:
 *   physical — the child keeps it. The Academy records that it belongs to the
 *              Trail and must NOT imply it holds a copy.
 *   digital  — genuinely stored by the Academy.
 *
 * Brief §27 and UI/UX §44 both warn explicitly against collapsing these. The
 * label below is therefore not decoration; it is the guarantee.
 */
/** How one Trail entry relates to an earlier one (Evidence v2, F6). */
const RELATION: Record<NonNullable<MissionEvidenceRow["relation"]>, string> = {
  revision_of: "A revision of",
  changed_plan_of: "Changes the plan in",
  result_of: "What came of",
  later_judgement_of: "A later judgement on",
  after_of: "After",
};

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export function EvidenceItem({
  evidence,
  url,
  related,
}: {
  evidence: MissionEvidenceRow;
  /** Signed URL for digital evidence. Always null for physical. */
  url: string | null;
  /** The earlier entry this one relates to, when it is on the same Trail. */
  related?: { id: string; title: string } | null;
}) {
  const isPhysical = evidence.type === "physical";
  const during = evidence.source === "mission";

  return (
    <li id={`entry-${evidence.id}`} className="scroll-mt-[var(--space-xl)] border-b border-[var(--color-border)] py-[var(--space-l)] last:border-b-0">
      {/* Sentence case: weight and colour carry this, not capitals. */}
      <p className="text-[length:var(--text-label)] font-medium text-[var(--color-text-muted)]">
        {isPhysical ? "You keep this" : "Saved here"}
        <span aria-hidden> · </span>
        <span className="sr-only">, </span>
        {during ? "during the mission" : "at the end"}
        <span aria-hidden> · </span>
        <span className="sr-only">, </span>
        <time dateTime={evidence.created_at}>{dateLabel(evidence.created_at)}</time>
      </p>

      {/* h2, not h3: a Trail entry is a section of the Mission Trail page. Jumping h1 → h3 skips a level (WCAG 1.3.1). */}
      <h2 className="mt-[var(--space-xs)] text-[length:var(--text-h3)]">
        {evidence.title}
      </h2>

      {evidence.relation && related && (
        <p className="mt-[var(--space-xs)] text-[length:var(--text-small)]">
          {RELATION[evidence.relation]}{" "}
          <a href={`#entry-${related.id}`} className="inline-flex min-h-[var(--target-min)] items-center underline decoration-[var(--color-border-strong)] underline-offset-4">
            {related.title}
          </a>
        </p>
      )}

      {evidence.description && (
        <p className="wla-measure mt-[var(--space-xs)] text-[var(--color-text-muted)]">
          {evidence.description}
        </p>
      )}

      {isPhysical ? (
        // Never offer an action that implies WLA holds the artefact.
        <p className="mt-[var(--space-sm)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          This one stays with you — it isn&rsquo;t stored in the Academy.
        </p>
      ) : (
        url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-[var(--space-sm)] inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
          >
            View
          </a>
        )
      )}
    </li>
  );
}
