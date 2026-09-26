import { AcademyHeader } from "@/components/academy/academy-header";
import { getActiveChildId } from "@/features/children/active-child";
import { listChildren } from "@/features/children/queries";
import type { ChildOption } from "@/components/profile/profile-switcher";

/**
 * Academy chrome — UI/UX §17.
 *
 * Rendered by each page rather than by the layout, because the header must be
 * QUIETER inside Active Mission and nested Next.js layouts compose rather than
 * replace. A layout-level header plus a nested quiet one produced two headers
 * stacked — the opposite of what §17 asks for.
 *
 * Making it a per-page decision keeps the variant explicit and visible at the
 * call site, with no route-string matching hidden in a layout.
 */
export async function AcademyChrome({
  variant = "default",
  mission,
}: {
  variant?: "default" | "quiet";
  /** Compact mission identity for the Active Mission header (UI/UX §35). */
  mission?: { title: string; slug: string };
}) {
  let childProfiles: ChildOption[] = [];
  let activeChildId: string | null = null;

  if (variant === "default") {
    try {
      childProfiles = await listChildren();
      activeChildId = await getActiveChildId();
    } catch {
      // Unauthenticated or backend unavailable — degrade to the logo alone
      // rather than failing the whole page.
    }
  }

  return (
    <AcademyHeader
      childProfiles={childProfiles}
      activeChildId={activeChildId}
      variant={variant}
      mission={mission}
    />
  );
}
