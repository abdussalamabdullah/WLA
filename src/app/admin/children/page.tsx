import { AdminPage, DataTable, Td } from "@/components/admin/admin-page";
import { CodeStatusTag } from "@/components/admin/admin-page";
import { AdminSearch } from "@/components/admin/admin-search";
import { adminChildren } from "@/features/admin/lms-queries";
import { RevokeCodeButton } from "@/components/admin/revoke-code-button";

export const metadata = { title: "Children" };

/**
 * ADMIN CHILDREN — brief §20.
 *
 * Shows progress COUNTS and access-code STATUS. It does not show what a child
 * wrote, chose or reflected on, and it cannot: nothing here reads
 * mission_responses, mission_state or mission_evidence content.
 *
 * "Do not reveal plaintext historical access codes unnecessarily" is satisfied
 * absolutely rather than by policy — only a bcrypt hash exists, so there is no
 * plaintext to reveal, here or anywhere.
 */
export default async function AdminChildrenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const children = await adminChildren(q);
  const year = new Date().getFullYear();

  return (
    <AdminPage title="Children" intro="View learners and their access.">
      <AdminSearch placeholder="Search by child or parent email" defaultValue={q} />

      <div className="mt-[var(--space-l)]">
        {children.length === 0 ? (
          <p className="text-[var(--color-text-muted)]">No children match that search.</p>
        ) : (
          <DataTable caption="Children" columns={["Child", "Age", "Parent", "Missions", "In progress", "Complete", "Last active", "Child access", ""]}>
            {children.map((c) => (
              <tr key={c.id}>
                <Td>{c.display_name}</Td>
                <Td>{c.birth_year ? year - c.birth_year : "—"}</Td>
                <Td>{c.parent_email}</Td>
                <Td>{c.missions}</Td>
                <Td>{c.in_progress}</Td>
                <Td>{c.complete}</Td>
                <Td>
                  {c.last_activity_at
                    ? new Date(c.last_activity_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                    : "—"}
                </Td>
                <Td>
                  <CodeStatusTag active={c.access_code_status === "active"} />
                </Td>
                <Td>
                  {c.access_code_status === "active" && (
                    <RevokeCodeButton childId={c.id} childName={c.display_name} />
                  )}
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </AdminPage>
  );
}
