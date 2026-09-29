import { AdminPage } from "@/components/admin/admin-page";
import { requireAdmin } from "@/lib/permissions";

export const metadata = { title: "Settings" };

/**
 * ADMIN SETTINGS.
 *
 * The brief lists Settings in the sidebar but specifies no settings. Rather
 * than invent configuration — every toggle here would be a product decision
 * this brief did not make — this states what is configured and where, which is
 * the genuinely useful thing for whoever opens it.
 */
export default async function AdminSettingsPage() {
  const { profile } = await requireAdmin();

  return (
    <AdminPage title="Settings" intro="How this Academy is configured.">
      <dl className="flex flex-col gap-[var(--space-m)]">
        <Row term="Signed in as" detail={profile.email} />
        <Row term="Role" detail="Administrator" />
        <Row
          term="Mission structure"
          detail="Published versions are locked. Structural changes need a new version."
        />
        <Row
          term="Child access"
          detail="Codes are created by a parent, stored only as a hash, and can be turned off from Children."
        />
        <Row
          term="Payments"
          detail="Entitlements are written by the payment provider's webhook. They cannot be created by hand."
        />
      </dl>

      <p className="mt-[var(--space-2xl)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Nothing to change yet. Anything that alters how missions behave needs a
        written product decision, not a toggle.
      </p>
    </AdminPage>
  );
}

function Row({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="border-b border-[var(--color-border)] pb-[var(--space-m)]">
      <dt className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">{term}</dt>
      <dd className="mt-[2px] wla-measure">{detail}</dd>
    </div>
  );
}
