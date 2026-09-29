import { AdminPage } from "@/components/admin/admin-page";
import { adminActivity } from "@/features/admin/lms-queries";
import { ACTIVITY_LABEL, formatWhen } from "@/features/admin/activity";

export const metadata = { title: "Activity" };

/**
 * ADMIN ACTIVITY — brief §22.
 *
 * Derived from existing tables, not from an events table (see the admin_lms
 * migration header). §22 also asks to "avoid storing unnecessary sensitive
 * learner data": deriving stores none at all.
 */
export default async function AdminActivityPage() {
  const activity = await adminActivity(100);

  return (
    <AdminPage title="Activity" intro="See recent Academy activity.">
      {activity.length === 0 ? (
        <p className="text-[var(--color-text-muted)]">Nothing has happened yet.</p>
      ) : (
        <ul className="flex flex-col">
          {activity.map((a, i) => (
            <li
              key={`${a.kind}-${a.happened_at}-${i}`}
              className="flex flex-wrap items-baseline justify-between gap-[var(--space-s)] border-b border-[var(--color-border)] py-[var(--space-s)]"
            >
              <span className="text-[length:var(--text-label)]">
                {ACTIVITY_LABEL(a.kind, a.subject, a.detail)}
              </span>
              <time
                dateTime={a.happened_at}
                className="text-[length:var(--text-small)] text-[var(--color-text-muted)]"
              >
                {formatWhen(a.happened_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
