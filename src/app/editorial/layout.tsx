import { redirect } from "next/navigation";

import { UnsavedChangesProvider } from "@/components/admin/unsaved-changes";
import { AppShell, type NavItem } from "@/components/app-shell/app-shell";
import { IconImport, IconJournal, IconLogout, IconOverview, IconParents, IconTag } from "@/components/app-shell/icons";
import { AccessError } from "@/lib/permissions";
import { requireJournalStaff } from "@/lib/permissions/journal";
import { logAccessDenied } from "@/lib/observability/logger";

export const metadata = { title: "Journal studio", robots: { index: false, follow: false } };

/**
 * THE JOURNAL STUDIO (D-123, D-124).
 *
 * Its own route, outside /admin, because writers and reviewers are staff
 * without being administrators. Gated here for what is SHOWN; every write and
 * every read of a draft is gated again in the database by role and article
 * membership, so this layout is never the only control.
 */
export default async function EditorialLayout({ children }: { children: React.ReactNode }) {
  let staff;
  try {
    staff = await requireJournalStaff();
  } catch (error) {
    if (error instanceof AccessError) {
      // Same answer as a refused admin page: no confirmation the route exists.
      logAccessDenied("editorial_route", { reason: error.reason });
      redirect("/academy/my-missions");
    }
    throw error;
  }
  const { caps, profile } = staff;

  const nav: NavItem[] = [
    { href: "/editorial", label: "Articles", icon: <IconJournal />, prefix: false },
    ...(caps.isEditor ? [
      { href: "/editorial/import", label: "Import from Medium", icon: <IconImport />, prefix: true },
      { href: "/editorial/categories", label: "Categories", icon: <IconTag /> },
    ] : []),
    ...(caps.isAdmin ? [
      { href: "/editorial/people", label: "People and roles", icon: <IconParents /> },
      { href: "/admin", label: "Academy admin", icon: <IconOverview /> },
    ] : []),
  ];
  const roleWords = caps.isAdmin ? "Admin" : caps.isEditor ? "Editor" : [caps.roles.includes("writer") && "Writer", caps.roles.includes("reviewer") && "Reviewer"].filter(Boolean).join(" · ");

  return (
    <AppShell nav={nav} utility={[{ href: "/logout", label: "Log out", icon: <IconLogout /> }]} identity={{ label: profile.email, meta: `Journal · ${roleWords}` }}>
      <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
    </AppShell>
  );
}
