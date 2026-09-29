import Link from "next/link";
import { AdminPage, DataTable, Td, StatusTag } from "@/components/admin/admin-page";
import { requireAdmin } from "@/lib/permissions";
import { formatPrice } from "@/lib/utils";
import { LAB_LABEL } from "@/features/missions/labs";
import type { MissionVersionStatus } from "@/types/database";

export const metadata = { title: "Missions" };

/**
 * MISSION CATALOGUE — brief §17.
 *
 * Shows every mission with the lifecycle state of its versions. The Status
 * column is the VERSION lifecycle (Draft / In Review / Published / Archived),
 * not `missions.published` — see the mission_versions migration for why those
 * are two different ideas. `In catalogue` is the second one, shown separately
 * so the distinction is visible rather than merged into one ambiguous word.
 */
export default async function AdminMissionsPage() {
  const { supabase } = await requireAdmin();

  const [{ data: missions }, { data: stats }, { data: versions }] = await Promise.all([
    supabase.from("missions").select("*").order("title"),
    supabase.rpc("admin_mission_stats", {}),
    supabase.from("mission_versions").select("mission_id, version, status"),
  ]);

  const statsById = new Map((stats ?? []).map((s) => [s.mission_id, s]));
  const versionsById = new Map<string, { version: number; status: MissionVersionStatus }[]>();
  for (const v of versions ?? []) {
    const list = versionsById.get(v.mission_id) ?? [];
    list.push({ version: v.version, status: v.status });
    versionsById.set(v.mission_id, list);
  }

  return (
    <AdminPage
      title="Missions"
      intro="Create, review and manage missions."
      action={
        <Link
          href="/admin/builder"
          className="inline-flex min-h-[var(--target-min)] items-center rounded-[var(--radius-button)] bg-[var(--color-primary)] px-[var(--space-l)] text-[length:var(--text-label)] font-medium text-[color:var(--color-primary-text)] hover:bg-[var(--color-primary-hover)]"
        >
          New mission
        </Link>
      }
    >
      {(missions ?? []).length === 0 ? (
        <p className="text-[var(--color-text-muted)]">No missions yet.</p>
      ) : (
        <DataTable
          caption="Mission catalogue"
          columns={["Mission", "Lab", "Versions", "In catalogue", "Price", "Entitled", "Started", "Completed", ""]}
        >
          {(missions ?? []).map((m) => {
            const s = statsById.get(m.id);
            const vs = (versionsById.get(m.id) ?? []).sort((a, b) => b.version - a.version);
            return (
              <tr key={m.id}>
                <Td>
                  <Link href={`/admin/missions/${m.slug}`} className="inline-flex min-h-[var(--target-min)] items-center font-medium underline decoration-[var(--color-border-strong)] underline-offset-4">
                    {m.title}
                  </Link>
                  <span className="block text-[var(--color-text-muted)]">{m.slug}</span>
                </Td>
                <Td>{LAB_LABEL[m.lab]}</Td>
                <Td>
                  <span className="flex flex-wrap gap-[4px]">
                    {vs.map((v) => (
                      <span key={v.version} className="whitespace-nowrap">
                        <span className="text-[var(--color-text-muted)]">v{v.version}</span>{" "}
                        <StatusTag status={v.status} />
                      </span>
                    ))}
                  </span>
                </Td>
                <Td>{m.published ? "Yes" : "No"}</Td>
                <Td>{m.is_free ? "Free" : formatPrice(m.price_minor ?? 0, m.currency)}</Td>
                <Td>{s?.entitlements ?? 0}</Td>
                <Td>{s?.starts ?? 0}</Td>
                <Td>{s?.completions ?? 0}</Td>
                <Td>
                  <Link href={`/admin/missions/${m.slug}`} className="inline-flex min-h-[var(--target-min)] items-center underline decoration-[var(--color-border-strong)] underline-offset-4">
                    Manage
                  </Link>
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </AdminPage>
  );
}
