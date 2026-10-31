import { coverSrc } from "@/features/missions/covers";
import Link from "next/link";
import type { SectionId, SectionStatus } from "@/features/admin/builder-readiness";
import { SECTIONS } from "@/features/admin/builder-readiness";
import { formatPrice } from "@/lib/utils";

/**
 * The top of a version's builder page (D-116): what is live where, the
 * mission's catalogue details, and an index of the page's sections with a
 * status in words. Server-rendered from data the page already loaded.
 */

/** Two facts, never blurred: the live VERSION and catalogue VISIBILITY. */
export function MissionStatusSummary({ lines }: { lines: string[] }) {
  return (
    <section aria-label="Mission status" className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
      <ul className="flex flex-col gap-[2px] text-[length:var(--text-label)]">
        {lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </section>
  );
}

const MARK: Record<SectionStatus["kind"], string> = {
  needs_attention: "!",
  not_started: "○",
  suggestions: "•",
  ok: "✓",
  optional: "–",
};

/** The section index: every section, linked, with a status in words. */
export function SectionIndex({ statuses }: { statuses: Record<SectionId, SectionStatus> }) {
  return (
    <nav aria-labelledby="builder-index-title" className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)] lg:sticky lg:top-[var(--space-m)]">
      <h2 id="builder-index-title" className="text-[length:var(--text-label)] font-medium">On this page</h2>
      <p className="mt-[2px] text-[length:var(--text-small)] text-[var(--color-text-muted)]">Work in any order. Statuses come from the automatic checks.</p>
      {/* Two columns on narrow screens, so the index doesn't push the work off the first screen. */}
      <ol className="mt-[var(--space-s)] grid grid-cols-2 gap-x-[var(--space-s)] lg:flex lg:flex-col">
        {SECTIONS.map((s) => {
          const st = statuses[s.id];
          return (
            <li key={s.id}>
              <a
                href={`#${s.anchor}`}
                className="flex min-h-[var(--target-min)] flex-col justify-center rounded-[var(--radius-control)] px-[var(--space-xs)] py-[4px] hover:bg-[var(--color-surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
              >
                {/* Inside the link above, which carries the 44px target. */}
                <span className="underline decoration-[var(--color-border-strong)] underline-offset-4 text-[length:var(--text-label)]">{s.label}</span>
                <span className={st.kind === "needs_attention" ? "text-[length:var(--text-small)] font-medium text-[var(--color-error)]" : "text-[length:var(--text-small)] text-[var(--color-text-muted)]"}>
                  <span aria-hidden="true">{MARK[st.kind]} </span>{st.text}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The catalogue details that live on the mission page, summarised. */
export function DetailsSummary({
  slug, title, description, coverImage, priceMinor, currency, isFree, catalogueVisible, ages, lab,
}: {
  slug: string; title: string; description: string | null; coverImage: string | null;
  priceMinor: number | null; currency: string; isFree: boolean; catalogueVisible: boolean;
  ages: string; lab: string;
}) {
  const cover = coverSrc(coverImage);
  const rows: [string, string][] = [
    ["Title", title],
    ["Lab · ages", `${lab} · ${ages}`],
    ["Catalogue description", description?.trim() ? description : "Not set"],
    ["Cover image", coverImage?.trim() ? "Set" : "Not set"],
    ["Price", isFree ? "Free" : priceMinor ? formatPrice(priceMinor, currency) : "Not set"],
    ["Catalogue", catalogueVisible ? "Shown in the catalogue" : "Hidden from the catalogue"],
  ];
  return (
    <section aria-labelledby="builder-details" className="mt-[var(--space-xl)]">
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-m)]">
        <h2 id="builder-details" className="scroll-mt-[var(--space-xl)] text-[length:var(--text-h3)]">Details</h2>
        <Link
          href={`/admin/missions/${slug}`}
          className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
        >
          Edit details
        </Link>
      </div>
      <p className="mt-[var(--space-xs)] wla-measure text-[var(--color-text-muted)]">
        How the mission is described and sold. These belong to the mission, not to a version, and are edited on the
        mission page.
      </p>
      <dl className="mt-[var(--space-s)] grid gap-x-[var(--space-l)] gap-y-[4px] text-[length:var(--text-small)] sm:grid-cols-[12rem_minmax(0,1fr)]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[var(--color-text-muted)]">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {cover && (
        // A plain img: an admin preview of a thumbnail, needing no optimisation.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="mt-[var(--space-s)] h-24 w-36 rounded-[var(--radius-card)] object-cover" />
      )}
    </section>
  );
}
