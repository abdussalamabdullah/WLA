import { AdminPage } from "@/components/admin/admin-page";
import { adminBoardQueue } from "@/features/mission-board/board";
import { moderateBoardAction } from "@/features/mission-board/actions";
import { LAB_LABEL } from "@/features/missions/labs";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Mission Board moderation" };

/**
 * MISSION BOARD MODERATION (D-73). WLA sees the anonymised copy, the mission
 * and the dates — never the child, the family or the original Trail entry.
 * Only contributions a parent has permitted are here. Publish, reject, edit
 * the copy further, and mark contrasting approaches for curation.
 */
export default async function BoardModerationPage() {
  const rows = await adminBoardQueue();
  const waiting = rows.filter((r) => r.status === "pending_moderation");
  const published = rows.filter((r) => r.status === "published");
  const section = (title: string, list: typeof rows, id: string) => (
    <section aria-labelledby={id} className="mt-[var(--space-2xl)]">
      <h2 id={id} className="text-[length:var(--text-h3)]">{title} ({list.length})</h2>
      {list.length === 0 ? (
        <p className="mt-[var(--space-s)] text-[var(--color-text-muted)]">Nothing here.</p>
      ) : (
        <ul className="mt-[var(--space-m)] flex flex-col gap-[var(--space-l)]">
          {list.map((r) => (
            <li key={r.id} className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-m)]">
              <p className="text-[length:var(--text-label)] text-[var(--color-text-muted)]">
                {r.mission_title} · {LAB_LABEL[r.lab]} · offered {new Date(r.created_at).toLocaleDateString("en-GB")}
              </p>
              <form action={moderateBoardAction} className="mt-[var(--space-s)] flex flex-col gap-[var(--space-s)]">
                <input type="hidden" name="id" value={r.id} />
                <label htmlFor={`text-${r.id}`} className="text-[length:var(--text-label)] font-medium">Anonymised text — check nothing identifies anyone</label>
                <textarea id={`text-${r.id}`} name="text" rows={4} defaultValue={r.text} maxLength={2000}
                  className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-s)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]" />
                <div className="flex flex-wrap items-end gap-[var(--space-m)]">
                  <label className="inline-flex min-h-[var(--target-min)] items-center gap-[var(--space-xs)]">
                    <input type="checkbox" name="curated" defaultChecked={r.curated} className="h-5 w-5 accent-[var(--color-primary)]" />
                    A contrasting approach (shown first)
                  </label>
                  <label className="flex flex-col gap-[var(--space-xs)]">
                    <span className="text-[length:var(--text-small)]">Approach label (optional)</span>
                    <input name="approach" defaultValue={r.approach ?? ""} maxLength={80}
                      className="min-h-[var(--target-min)] rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-s)]" />
                  </label>
                </div>
                <div className="flex flex-wrap gap-[var(--space-s)]">
                  {r.status === "pending_moderation" ? (
                    <>
                      <Button type="submit" name="action" value="publish">Publish</Button>
                      <Button type="submit" name="action" value="reject" variant="secondary">Don&rsquo;t publish</Button>
                    </>
                  ) : (
                    <>
                      <Button type="submit" name="action" value="save">Save changes</Button>
                      <Button type="submit" name="action" value="unpublish" variant="secondary">Take it down for review</Button>
                    </>
                  )}
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <AdminPage title="Mission Board" intro="Contributions families have permitted. Nothing appears on the Board until it is published here.">
      {section("Waiting for review", waiting, "board-waiting")}
      {section("Published", published, "board-published")}
    </AdminPage>
  );
}
