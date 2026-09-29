import Link from "next/link";
import { listMissionsWithStats } from "@/features/admin/queries";
import { PageHeader } from "@/components/ui/section";
import { formatPrice } from "@/lib/utils";

export const metadata = { title: "Missions" };

/**
 * The mission catalogue, with the ANALYTICS-01 figures beside each row.
 *
 * Counts and content sit together on purpose: the question an editor actually
 * has is "is this mission working", and answering it should not require a
 * second tool. Drop-off is derived (started, not completed, quiet for 14 days)
 * rather than tracked as an event — see conflict C7.
 */
export default async function AdminMissionsPage() {
  const missions = await listMissionsWithStats();

  return (
    <main className="wla-container py-[var(--space-2xl)] md:py-[var(--space-3xl)]">
      <PageHeader
        title="Missions"
        editorial="What is published, and how it is going."
      />

      {missions.length === 0 ? (
        <p className="mt-[var(--space-2xl)] text-[var(--color-text-muted)]">
          No missions yet.
        </p>
      ) : (
        <div className="mt-[var(--space-2xl)] overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <caption className="sr-only">
              Mission catalogue with entitlement and progress counts
            </caption>
            <thead>
              <tr className="border-b border-[var(--color-border-strong)]">
                {[
                  "Mission",
                  "Status",
                  "Price",
                  "Entitled",
                  "Started",
                  "Completed",
                  "In progress",
                  "Quiet 14d",
                ].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="py-[var(--space-m)] pr-[var(--space-l)] text-[length:var(--text-small)] font-medium text-[var(--color-text-muted)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {missions.map((m) => (
                <tr
                  key={m.mission_id}
                  className="border-b border-[var(--color-border)]"
                >
                  <th
                    scope="row"
                    className="py-[var(--space-l)] pr-[var(--space-l)] font-normal"
                  >
                    <Link
                      href={`/admin/missions/${m.slug}`}
                      className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
                    >
                      {m.title}
                    </Link>
                    <span className="block text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                      {m.slug} · v{m.version}
                    </span>
                  </th>
                  <td className="py-[var(--space-l)] pr-[var(--space-l)]">
                    {/* Status is never carried by colour alone (Architecture §20). */}
                    <span className="inline-flex items-center gap-[var(--space-s)] text-[length:var(--text-small)]">
                      <span
                        aria-hidden
                        className={
                          m.published
                            ? "size-2.5 rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-primary)]"
                            : "size-2.5 rounded-full border-2 border-[var(--color-border-strong)]"
                        }
                      />
                      {m.published ? "Published" : "Draft"}
                    </span>
                  </td>
                  <Cell>
                    {m.is_free
                      ? "Free"
                      : m.price_minor === null
                        ? "—"
                        : formatPrice(m.price_minor, m.currency)}
                  </Cell>
                  <Cell>{m.entitlements}</Cell>
                  <Cell>{m.starts}</Cell>
                  <Cell>{m.completions}</Cell>
                  <Cell>{m.in_progress}</Cell>
                  <Cell>{m.dropped_off}</Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="wla-measure mt-[var(--space-2xl)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        “Quiet 14d” is a mission a child started, has not completed, and has not
        returned to for a fortnight. It is worked out from progress rather than
        recorded as an event — nothing here is joined to a child.
      </p>
    </main>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="py-[var(--space-l)] pr-[var(--space-l)] tabular-nums">
      {children}
    </td>
  );
}
