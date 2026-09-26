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
export function EvidenceItem({
  evidence,
  url,
}: {
  evidence: MissionEvidenceRow;
  /** Signed URL for digital evidence. Always null for physical. */
  url: string | null;
}) {
  const isPhysical = evidence.type === "physical";

  return (
    <li className="border-b border-[var(--color-border)] py-[var(--space-l)] last:border-b-0">
      {/* Sentence case: weight and colour carry this, not capitals. */}
      <p className="text-[length:var(--text-label)] font-medium text-[var(--color-text-muted)]">
        {isPhysical ? "You keep this" : "Saved here"}
      </p>

      <h3 className="mt-[var(--space-xs)] text-[length:var(--text-h3)]">
        {evidence.title}
      </h3>

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
