import { AdminPage, DataTable, Td } from "@/components/admin/admin-page";
import { AdminSearch } from "@/components/admin/admin-search";
import { adminParents } from "@/features/admin/lms-queries";

export const metadata = { title: "Parents" };

/**
 * ADMIN PARENTS — brief §19.
 *
 * Shows what an administrator needs to answer a support question: who they
 * are, how many children, how much access, when they joined. It shows NO
 * authentication data — there is none here to show, because passwords live in
 * GoTrue and this table never touches it.
 */
export default async function AdminParentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const parents = await adminParents(q);

  return (
    <AdminPage title="Parents" intro="View and manage parent accounts.">
      <AdminSearch placeholder="Search by name or email" defaultValue={q} />

      <div className="mt-[var(--space-l)]">
        {parents.length === 0 ? (
          <p className="text-[var(--color-text-muted)]">No parents match that search.</p>
        ) : (
          <DataTable caption="Parents" columns={["Name", "Email", "Children", "Missions", "Orders", "Joined", "Role"]}>
            {parents.map((p) => (
              <tr key={p.id}>
                <Td>{p.name ?? "—"}</Td>
                <Td>{p.email}</Td>
                <Td>{p.children}</Td>
                <Td>{p.entitlements}</Td>
                <Td>{p.orders}</Td>
                <Td>{new Date(p.joined_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Td>
                <Td>{p.is_admin ? "Admin" : "Parent"}</Td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </AdminPage>
  );
}
