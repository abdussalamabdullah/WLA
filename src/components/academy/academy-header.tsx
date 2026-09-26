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
  mission,
}: {
  childProfiles: ChildOption[];
  activeChildId: string | null;
  variant?: "default" | "quiet";
  /**
   * Compact mission identity, shown only in the quiet variant.
   *
   * UI/UX §35 puts the mission title and the Mission Home / Mission Kit links
   * in the Active Mission header rather than the content area, which answers
   * §36's "Where am I?" in a consistent place and leaves the screen itself
   * free for the task.
   */
  mission?: { title: string; slug: string };
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
          className={cn(
            "font-[family-name:var(--font-serif)]",
            quiet
              ? "text-[length:var(--text-label)] text-[var(--color-text-muted)]"
              : "text-[length:var(--text-h3)]",
          )}
        >
          Within Lab Academy
        </Link>

        {/* §35 — mission identity and the two ways out, in the header. */}
        {quiet && mission && (
          <nav
            aria-label="Mission"
            className="flex flex-wrap items-baseline gap-[var(--space-l)]"
          >
            <span className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]">
              {mission.title}
            </span>
            <Link
              href={`/academy/missions/${mission.slug}`}
              className="text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
            >
              Mission Home
            </Link>
            <Link
              href={`/academy/missions/${mission.slug}/kit`}
              className="text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
            >
              Mission Kit
            </Link>
          </nav>
        )}

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
