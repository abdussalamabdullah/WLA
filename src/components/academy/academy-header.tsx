import Link from "next/link";
import {
  ProfileSwitcher,
  type ChildOption,
} from "@/components/profile/profile-switcher";
import { cn } from "@/lib/utils";

/**
 * ACADEMY HEADER — UI/UX §17.
 *
 * Deliberately lighter than the public navigation: the Academy does not
 * replicate the full public nav inside every mission screen.
 *
 * §17: "The header should become visually quieter once the learner enters
 * Active Mission." Hence `variant="quiet"`, which drops the profile control
 * and the border so nothing competes with the mission.
 */
export function AcademyHeader({
  childProfiles,
  activeChildId,
  variant = "default",
}: {
  childProfiles: ChildOption[];
  activeChildId: string | null;
  variant?: "default" | "quiet";
}) {
  const quiet = variant === "quiet";

  return (
    <header className={cn(!quiet && "border-b border-[var(--color-border)]")}>
      <div
        className={cn(
          "flex min-h-[64px] items-center justify-between gap-[var(--space-m)]",
          quiet ? "wla-container-narrow" : "wla-container",
        )}
      >
        <Link
          href="/academy/my-missions"
          className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]"
        >
          Within Lab Academy
        </Link>

        {!quiet && (
          <div className="flex items-center gap-[var(--space-l)]">
            <ProfileSwitcher
              childProfiles={childProfiles}
              activeChildId={activeChildId}
            />
            <Link
              href="/account"
              className="text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
            >
              Account
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
