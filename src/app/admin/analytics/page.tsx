import Link from "next/link";
import { AdminPage, DataTable, Td, Stat } from "@/components/admin/admin-page";
import { adminAnalytics, adminOverview } from "@/features/admin/lms-queries";

export const metadata = { title: "Analytics" };

/**
 * ADMIN ANALYTICS — brief §23.
 *
 * Aggregate only, and explicitly never an authorisation input: nothing in
 * lib/permissions or any `security definer` function consults these numbers.
 *
 * Drop-off is DERIVED, not tracked (C7): it is the count of runs started, not
 * completed, and untouched for a fortnight. There is no `mission_drop_off`
 * event because a child cannot emit the absence of an action.
 */
export default async function AdminAnalyticsPage() {
  const [rows, overview] = await Promise.all([adminAnalytics(), adminOverview()]);

  const totalStarts = rows.reduce((n, r) => n + Number(r.starts), 0);
  const totalCompletions = rows.reduce((n, r) => n + Number(r.completions), 0);
  const rate = totalStarts ? Math.round((totalCompletions / totalStarts) * 1000) / 10 : 0;

  return (
    <AdminPage title="Analytics" intro="See how learners are using the Academy.">
      <div className="grid grid-cols-2 gap-[var(--space-m)] sm:grid-cols-4">
        <Stat label="Mission starts" value={totalStarts} />
        <Stat label="Completions" value={totalCompletions} />
        <Stat label="Completion rate" value={`${rate}%`} />
        <Stat label="Active learners" value={overview?.active_learners ?? 0} hint="Last 30 days" />
      </div>

      <section className="mt-[var(--space-2xl)]">
        <h2 className="text-[length:var(--text-h3)]">By mission</h2>
        <div className="mt-[var(--space-m)]">
          <DataTable
            caption="Mission analytics"
            columns={["Mission", "Published", "Entitled", "Starts", "In progress", "Completed", "Completion rate", "Quiet 14d", ""]}
          >
            {rows.map((r) => (
              <tr key={r.mission_id}>
                <Td>
                  <Link href={`/admin/missions/${r.slug}`} className="inline-flex min-h-[var(--target-min)] items-center underline decoration-[var(--color-border-strong)] underline-offset-4">
                    {r.title}
                  </Link>
                </Td>
                <Td>{r.published_version ? `v${r.published_version}` : "—"}</Td>
                <Td>{r.entitlements}</Td>
                <Td>{r.starts}</Td>
                <Td>{r.in_progress}</Td>
                <Td>{r.completions}</Td>
                <Td>{r.completion_rate}%</Td>
                <Td>{r.quiet_14d}</Td>
                <Td>
                  <Link href={`/admin/analytics/${r.slug}`} className="inline-flex min-h-[var(--target-min)] items-center underline decoration-[var(--color-border-strong)] underline-offset-4">
                    Insights<span className="sr-only"> for {r.title}</span>
                  </Link>
                </Td>
              </tr>
            ))}
          </DataTable>
        </div>
        <p className="mt-[var(--space-m)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          &ldquo;Quiet 14d&rdquo; is a mission a child started, has not
          completed, and has not returned to for a fortnight. It is worked out
          from progress records rather than tracked as an event.
        </p>
      </section>
    </AdminPage>
  );
}
