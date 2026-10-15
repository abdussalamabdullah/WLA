import Link from "next/link";

import { AdminPage, DataTable, Td } from "@/components/admin/admin-page";
import { FormNotice } from "@/components/ui/field";
import { NewArticleForm } from "@/components/journal/studio/forms";
import { JournalStatus } from "@/components/journal/studio/status";
import { getSchedulerStatus, listStudioArticles } from "@/features/journal/queries";
import { STATUS_LABEL, type DisplayStatus } from "@/features/journal/status";
import { requireJournalStaff } from "@/lib/permissions/journal";

const FILTERS: (DisplayStatus | "all")[] = ["all", "draft", "in_review", "changes_requested", "approved", "scheduled", "published", "archived"];

export default async function EditorialHome({ searchParams }: { searchParams: Promise<{ status?: string; notice?: string }> }) {
  const sp = await searchParams;
  const { caps } = await requireJournalStaff();
  const [all, scheduler] = await Promise.all([listStudioArticles(), getSchedulerStatus()]);
  const filter = (FILTERS as string[]).includes(sp.status ?? "") ? (sp.status as DisplayStatus | "all") : "all";
  const rows = filter === "all" ? all : all.filter((r) => r.status.status === filter || r.status.pending === filter);

  return (
    <AdminPage
      title="Journal articles"
      intro={caps.isEditor ? "Every article, in every state. Nothing reaches the public Journal until someone allowed to publish it does so; reviews are optional." : "The articles you write or review. You can publish articles you author; reviews are optional."}
    >
      {scheduler && (!scheduler.configured || !scheduler.active || scheduler.overdue > 0) && (
        <p role="alert" className="mb-[var(--space-l)] wla-measure rounded-[var(--radius-input)] border border-[var(--color-error)] bg-[var(--color-surface)] p-[var(--space-m)]">
          {!scheduler.configured || !scheduler.active
            ? "Automatic publishing is not running on this database, so scheduled articles will not publish by themselves. See docs/JOURNAL-CMS.md → Scheduler."
            : `${scheduler.overdue} scheduled ${scheduler.overdue === 1 ? "article is" : "articles are"} past due: the automatic publisher may be behind. It catches up on its next run.`}
        </p>
      )}
      {sp.notice === "deleted" && <div className="mb-[var(--space-l)]"><FormNotice message="The draft was deleted." /></div>}
      {caps.canWrite && (
        <section aria-labelledby="new-article" className="mb-[var(--space-2xl)] max-w-[40rem]">
          <h2 id="new-article" className="text-[length:var(--text-h2)]">Start an article</h2>
          <div className="mt-[var(--space-m)]"><NewArticleForm /></div>
        </section>
      )}

      <section aria-labelledby="articles">
        <h2 id="articles" className="text-[length:var(--text-h2)]">Articles</h2>
        <nav aria-label="Filter by status" className="mt-[var(--space-m)]">
          <ul className="flex flex-wrap gap-[var(--space-xs)]">
            {FILTERS.map((f) => {
              const count = f === "all" ? all.length : all.filter((r) => r.status.status === f || r.status.pending === f).length;
              const current = f === filter;
              return (
                <li key={f}>
                  <Link
                    href={f === "all" ? "/editorial" : `/editorial?status=${f}`}
                    aria-current={current ? "page" : undefined}
                    className={`inline-flex min-h-[var(--target-min)] items-center rounded-[var(--radius-control)] border px-[var(--space-s)] text-[length:var(--text-small)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] ${current ? "border-[var(--color-text)] bg-[var(--color-surface-sage)] font-medium underline" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}
                  >
                    {f === "all" ? "All" : STATUS_LABEL[f]} ({count})
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {rows.length === 0 ? (
          <p className="mt-[var(--space-l)] text-[var(--color-text-muted)]">{all.length === 0 ? "No articles yet." : "No articles in this state."}</p>
        ) : (
          <div className="mt-[var(--space-l)]">
            <DataTable columns={["Article", "Status", "Last changed"]} caption="Journal articles">
              {rows.map((r) => (
                <tr key={r.article.id}>
                  <Td>
                    <Link href={`/editorial/articles/${r.article.id}`} className="font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]">
                      {r.working?.title || r.live?.title || "Untitled"}
                    </Link>
                    {r.imported && <span className="ml-[var(--space-xs)] text-[var(--color-text-muted)]">· Imported</span>}
                  </Td>
                  <Td><JournalStatus status={r.status.status} pending={r.status.pending} /></Td>
                  <Td>{new Date(r.article.updated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</Td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </section>
    </AdminPage>
  );
}
