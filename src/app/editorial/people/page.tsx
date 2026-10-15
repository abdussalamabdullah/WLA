import { redirect } from "next/navigation";

import { AdminPage, DataTable, Td } from "@/components/admin/admin-page";
import { RoleForm } from "@/components/journal/studio/forms";
import { getStaffDirectory } from "@/features/journal/queries";
import { requireJournalStaff } from "@/lib/permissions/journal";

export const metadata = { title: "People and roles · Journal studio" };

/**
 * Journal roles (D-124). Admins only — journal_set_role refuses anyone else.
 * Staff use their ordinary WLA account; there is no separate sign-in.
 */
export default async function PeoplePage() {
  const { caps } = await requireJournalStaff();
  if (!caps.isAdmin) redirect("/editorial");
  const staff = await getStaffDirectory();
  return (
    <AdminPage title="People and roles" intro="Who can write, review and publish in the Journal. Administrators can do everything. Roles never give access to the Academy's families, children or orders.">
      <section aria-labelledby="change">
        <h2 id="change" className="text-[length:var(--text-h2)]">Grant or remove a role</h2>
        <div className="mt-[var(--space-m)]"><RoleForm /></div>
      </section>
      <section aria-labelledby="staff" className="mt-[var(--space-2xl)]">
        <h2 id="staff" className="text-[length:var(--text-h2)]">Journal staff</h2>
        <div className="mt-[var(--space-m)]">
          <DataTable columns={["Person", "Email", "Roles"]} caption="Journal staff">
            {staff.map((p) => (
              <tr key={p.profile_id}>
                <Td>{p.name || "—"}</Td>
                <Td>{p.email}</Td>
                <Td>{[p.is_admin && "Administrator", ...p.roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1))].filter(Boolean).join(" · ")}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
      </section>
    </AdminPage>
  );
}
