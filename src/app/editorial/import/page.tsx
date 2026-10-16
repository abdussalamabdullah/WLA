import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPage, DataTable, Td } from "@/components/admin/admin-page";
import { ImportForm } from "@/components/journal/studio/forms";
import { listImportRuns } from "@/features/journal/queries";
import { requireJournalStaff } from "@/lib/permissions/journal";

export const metadata = { title: "Import from Medium · Journal studio" };

export default async function ImportPage() {
  const { caps } = await requireJournalStaff();
  if (!caps.isEditor) redirect("/editorial");
  const runs = await listImportRuns();

  return (
    <AdminPage title="Import from Medium" intro="Bring existing Medium posts into the Journal as drafts. Nothing is published: every imported post becomes a draft you publish when you're ready.">
      <section aria-labelledby="how" className="wla-measure">
        <h2 id="how" className="text-[length:var(--text-h2)]">How it works</h2>
        <ol className="mt-[var(--space-s)] list-decimal pl-[var(--space-l)] wla-prose">
          <li>On Medium: Settings → Security and apps → Download your information. Medium emails a .zip.</li>
          <li>Upload that .zip here (or individual post .html files from its posts folder).</li>
          <li>Each post becomes a draft with its formatting, images, author, original date and Medium link. A report lists anything that needs a person: missing alt text, embeds that couldn&rsquo;t come across, links back to Medium, and URL clashes.</li>
          <li>Running the same export again is safe: unchanged posts are skipped, and a post you have edited here is never overwritten.</li>
        </ol>
      </section>

      <section aria-labelledby="upload" className="mt-[var(--space-2xl)]">
        <h2 id="upload" className="text-[length:var(--text-h2)]">Upload</h2>
        <div className="mt-[var(--space-m)]"><ImportForm /></div>
      </section>

      <section aria-labelledby="runs" className="mt-[var(--space-2xl)]">
        <h2 id="runs" className="text-[length:var(--text-h2)]">Previous imports</h2>
        {runs.length === 0 ? (
          <p className="mt-[var(--space-s)] text-[var(--color-text-muted)]">None yet.</p>
        ) : (
          <div className="mt-[var(--space-m)]">
            <DataTable columns={["When", "Source", "Result"]} caption="Previous imports">
              {runs.map((r) => {
                const t = r.totals as Record<string, number>;
                return (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/editorial/import/${r.id}`} className="underline underline-offset-4">{new Date(r.started_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</Link>
                    </Td>
                    <Td>{r.source_name ?? "—"}</Td>
                    <Td>{r.finished_at ? `${t.created ?? 0} created · ${t.updated ?? 0} updated · ${t.unchanged ?? 0} unchanged · ${t.failed ?? 0} failed` : "Did not finish"}</Td>
                  </tr>
                );
              })}
            </DataTable>
          </div>
        )}
      </section>
    </AdminPage>
  );
}
