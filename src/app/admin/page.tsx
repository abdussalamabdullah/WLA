import Link from "next/link";
import { AdminPage, Stat, DataTable, Td } from "@/components/admin/admin-page";
import { adminOverview, adminActivity, adminAnalytics } from "@/features/admin/lms-queries";
import { ACTIVITY_LABEL, formatWhen } from "@/features/admin/activity";

export const metadata = { title: "Overview" };

/**
 * ADMIN OVERVIEW — brief §18.
 *
 * "Do not turn the page into a complicated BI dashboard." So: eight numbers,
 * the last ten things that happened, and a per-mission table. No charts, no
 * date-range pickers, no drill-downs — Analytics is where that belongs.
 */
export default async function AdminOverviewPage() {
  const [overview, activity, analytics] = await Promise.all([
    adminOverview(),
    adminActivity(10),
    adminAnalytics(),
  ]);

  return (
    <AdminPage title="Overview" intro="A quick view of what is happening in the Academy.">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-[var(--space-m)]">
        <Stat label="Parents" value={overview?.parents ?? 0} />
        <Stat label="Children" value={overview?.children ?? 0} />
        <Stat label="Active learners" value={overview?.active_learners ?? 0} hint="Last 30 days" />
        <Stat label="Published missions" value={overview?.published_missions ?? 0} />
        <Stat label="Mission starts" value={overview?.starts ?? 0} />
        <Stat label="Completions" value={overview?.completions ?? 0} />
        <Stat label="Drafts in progress" value={overview?.draft_missions ?? 0} />
        <Stat label="Orders" value={overview?.orders ?? 0} />
      </div>

      <section className="mt-[var(--space-2xl)]">
        <div className="flex items-baseline justify-between gap-[var(--space-m)]">
          <h2 className="text-[length:var(--text-h3)]">Recent activity</h2>
          <Link
            href="/admin/activity"
            className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4"
          >
            See all →
          </Link>
        </div>
        {activity.length === 0 ? (
          <p className="mt-[var(--space-m)] text-[var(--color-text-muted)]">Nothing has happened yet.</p>
        ) : (
          <ul className="mt-[var(--space-m)] flex flex-col">
            {activity.map((a, i) => (
              <li key={`${a.kind}-${a.happened_at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-[var(--space-s)] border-b border-[var(--color-border)] py-[var(--space-s)]">
                <span className="text-[length:var(--text-label)]">
                  {ACTIVITY_LABEL(a.kind, a.subject, a.detail)}
                </span>
                <span className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  {formatWhen(a.happened_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-[var(--space-2xl)]">
        <h2 className="text-[length:var(--text-h3)]">Mission activity</h2>
        <div className="mt-[var(--space-m)]">
          <DataTable caption="Mission activity" columns={["Mission", "Starts", "In progress", "Completed"]}>
            {analytics.map((m) => (
              <tr key={m.mission_id}>
                <Td><Link href={`/admin/missions/${m.slug}`} className="inline-flex min-h-[var(--target-min)] items-center underline decoration-[var(--color-border-strong)] underline-offset-4">{m.title}</Link></Td>
                <Td>{m.starts}</Td>
                <Td>{m.in_progress}</Td>
                <Td>{m.completions}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
      </section>
    </AdminPage>
  );
}
