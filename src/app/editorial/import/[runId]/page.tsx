import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminPage, Stat } from "@/components/admin/admin-page";
import { getImportRun } from "@/features/journal/queries";
import { requireJournalStaff } from "@/lib/permissions/journal";

export const metadata = { title: "Import report · Journal studio" };

const OUTCOME: Record<string, string> = {
  created: "Created as a draft",
  updated: "Draft updated from Medium",
  unchanged: "Already imported — unchanged",
  skipped_edited: "Skipped — edited in WLA",
  skipped_draft: "Skipped — Medium draft",
  failed: "Failed",
};

type Message = { level: "info" | "warning" | "error"; text: string };
const LEVEL: Record<Message["level"], string> = { error: "Problem", warning: "Needs attention", info: "Note" };

/** What happened to every post, and what a person needs to fix. */
export default async function ImportReportPage({ params }: { params: Promise<{ runId: string }> }) {
  const { caps } = await requireJournalStaff();
  if (!caps.isEditor) redirect("/editorial");
  const { runId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(runId)) notFound();
  const data = await getImportRun(runId);
  if (!data) notFound();
  const { run, items } = data;
  const t = run.totals as Record<string, number | string[]>;
  const problems = Array.isArray(t.problems) ? (t.problems as string[]) : [];
  const attention = items.filter((i) => (i.messages as Message[]).some((m) => m.level !== "info") || i.outcome === "failed");

  return (
    <AdminPage title="Import report" intro={`${run.source_name ?? "Medium export"} · ${new Date(run.started_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. Imported articles are drafts; none is public.`}>
      <Link href="/editorial/import" className="inline-flex min-h-[var(--target-min)] items-center underline underline-offset-4">← Import again</Link>
      <div className="mt-[var(--space-l)] grid grid-cols-2 gap-[var(--space-m)] md:grid-cols-4">
        <Stat label="Created" value={Number(t.created ?? 0)} />
        <Stat label="Updated" value={Number(t.updated ?? 0)} />
        <Stat label="Unchanged or skipped" value={Number(t.unchanged ?? 0) + Number(t.skipped_edited ?? 0) + Number(t.skipped_draft ?? 0)} />
        <Stat label="Failed" value={Number(t.failed ?? 0)} hint={Number(t.failed ?? 0) ? "Run the import again to retry." : undefined} />
      </div>

      {problems.length > 0 && (
        <section aria-labelledby="files" className="mt-[var(--space-xl)]">
          <h2 id="files" className="text-[length:var(--text-h2)]">Files not read</h2>
          <ul className="mt-[var(--space-s)] list-disc pl-[var(--space-l)]">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </section>
      )}

      <section aria-labelledby="fix" className="mt-[var(--space-xl)]">
        <h2 id="fix" className="text-[length:var(--text-h2)]">Needs a person ({attention.length})</h2>
        {attention.length === 0 ? (
          <p className="mt-[var(--space-s)] text-[var(--color-text-muted)]">Nothing needs manual correction.</p>
        ) : (
          <ul className="mt-[var(--space-s)] list-disc pl-[var(--space-l)]">
            {attention.map((i) => (
              <li key={i.id}>
                <a href={`#post-${i.id}`} className="inline-flex min-h-[var(--target-min)] items-center underline underline-offset-4">{i.title}</a>
                {" "}— {(i.messages as Message[]).filter((m) => m.level !== "info").length || 1} to check
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="all" className="mt-[var(--space-xl)]">
        <h2 id="all" className="text-[length:var(--text-h2)]">Every post</h2>
        <ol className="mt-[var(--space-m)] flex flex-col gap-[var(--space-l)]">
          {items.map((i) => {
            const messages = i.messages as Message[];
            return (
              <li key={i.id} id={`post-${i.id}`} className="scroll-mt-[var(--space-xl)] border-t border-[var(--color-border)] pt-[var(--space-m)]">
                <h3 className="text-[length:var(--text-h3)]">
                  {i.article_id && i.outcome !== "failed" ? (
                    <Link href={`/editorial/articles/${i.article_id}`} className="underline underline-offset-4">{i.title}</Link>
                  ) : (
                    i.title
                  )}
                </h3>
                <p className="mt-[var(--space-xs)]"><strong>{OUTCOME[i.outcome] ?? i.outcome}</strong>{i.final_slug ? ` · /journal/${i.final_slug}` : ""}</p>
                {i.source_url && <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)] break-all">Source: {i.source_url}</p>}
                {messages.length > 0 && (
                  <ul className="mt-[var(--space-s)] flex flex-col gap-[var(--space-xs)]">
                    {messages.map((m, n) => (
                      <li key={n} className="text-[length:var(--text-small)]">
                        <span className="font-medium">{LEVEL[m.level]}:</span> {m.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </AdminPage>
  );
}
