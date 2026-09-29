import { AdminPage } from "@/components/admin/admin-page";

export const metadata = { title: "Help" };

export default function AdminHelpPage() {
  return (
    <AdminPage title="Help" intro="How the Academy's moving parts fit together.">
      <div className="flex max-w-[60ch] flex-col gap-[var(--space-l)]">
        <section>
          <h2 className="text-[length:var(--text-h3)]">Why can&rsquo;t I edit a published mission?</h2>
          <p className="mt-[var(--space-xs)] text-[var(--color-text-muted)]">
            Children keep the version they started on. Use
            <strong> Create new version</strong> — it copies everything into a
            draft you can edit freely.
          </p>
        </section>
        <section>
          <h2 className="text-[length:var(--text-h3)]">What happens when I publish?</h2>
          <p className="mt-[var(--space-xs)] text-[var(--color-text-muted)]">
            New learners get the new version. The previous one is archived, not
            deleted, so anyone mid-mission carries on.
          </p>
        </section>
        <section>
          <h2 className="text-[length:var(--text-h3)]">Why won&rsquo;t it let me publish?</h2>
          <p className="mt-[var(--space-xs)] text-[var(--color-text-muted)]">
            Something would strand a learner: a choice pointing nowhere, a screen
            nothing reaches, or no way to finish. Review lists them.
          </p>
        </section>
        <section>
          <h2 className="text-[length:var(--text-h3)]">Can I delete a mission?</h2>
          <p className="mt-[var(--space-xs)] text-[var(--color-text-muted)]">
            Only if no child has ever been given it, started it or produced
            anything in it. Otherwise archive it: it disappears for new learners
            and every existing record stays intact.
          </p>
        </section>
      </div>
    </AdminPage>
  );
}
