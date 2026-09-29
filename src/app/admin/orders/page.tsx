import { AdminPage, DataTable, Td, StatusTag } from "@/components/admin/admin-page";
import { adminOrders } from "@/features/admin/lms-queries";
import { formatPrice } from "@/lib/utils";

export const metadata = { title: "Orders" };

/**
 * ADMIN ORDERS — brief §21, and its constraint: an admin must not be able to
 * fabricate a payment record.
 *
 * This surface is READ ONLY and has no companion write action anywhere in the
 * codebase. Entitlement remains server-controlled: it is written by the Stripe
 * webhook against a verified signature, and `state` below is derived by asking
 * whether that entitlement exists rather than by reading a status column an
 * administrator could edit.
 */
export default async function AdminOrdersPage() {
  const orders = await adminOrders();

  return (
    <AdminPage title="Orders" intro="View purchases and entitlements.">
      {orders.length === 0 ? (
        <p className="text-[var(--color-text-muted)]">No orders yet.</p>
      ) : (
        <DataTable caption="Orders" columns={["Date", "Parent", "Child", "Mission", "Amount", "State"]}>
          {orders.map((o) => (
            <tr key={o.id}>
              <Td>{new Date(o.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Td>
              <Td>{o.parent_email}</Td>
              <Td>{o.child_name}</Td>
              <Td>{o.mission_title}</Td>
              <Td>{formatPrice(o.amount_minor, o.currency)}</Td>
              <Td><StatusTag status={o.state === "paid" ? "published" : "draft"} /></Td>
            </tr>
          ))}
        </DataTable>
      )}
      <p className="mt-[var(--space-l)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Payment state is read from the entitlement the payment provider created.
        It cannot be set from here.
      </p>
    </AdminPage>
  );
}
