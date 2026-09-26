import { AcademyHeader } from "@/components/academy/academy-header";
import { getActiveChildId } from "@/features/children/active-child";
import { listChildren } from "@/features/children/queries";
import type { ChildOption } from "@/components/profile/profile-switcher";

/**
 * ACADEMY SHELL — UI/UX §17.
 *
 * Loads the family's child profiles once for the header. Individual screens
 * still resolve and re-validate the active child themselves; nothing here is
 * treated as authorisation.
 */
export default async function AcademyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let childProfiles: ChildOption[] = [];
  let activeChildId: string | null = null;

  try {
    childProfiles = await listChildren();
    activeChildId = await getActiveChildId();
  } catch {
    // Unauthenticated or backend unavailable — the header degrades to the
    // logo alone rather than failing the whole Academy shell.
  }

  return (
    <div className="min-h-dvh">
      <AcademyHeader
        childProfiles={childProfiles}
        activeChildId={activeChildId}
      />
      {children}
    </div>
  );
}
