import Image from "next/image";
import Link from "next/link";
import wlaLogo from "../../../public/wla-logo-horizontal.png";
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
    /*
      MEASURED: the public site's header sits on its own lighter band
      (#f4eee3) above the canvas, roughly 80px tall, separated by a hairline.
      The band is what does the separating — the rule alone left the header
      sitting on the same surface as the page, which the site never does.

      The quiet variant keeps neither, per §17.
    */
    <header
      className={cn(
        !quiet && "wla-band-raised border-b border-[var(--color-border)]",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-[var(--space-m)]",
          quiet && "flex-wrap gap-y-0",
          quiet ? "min-h-[64px]" : "min-h-[80px]",
          quiet ? "wla-container-narrow" : "wla-container",
        )}
      >
        {/*
          The wordmark, not type set to look like it. The logo is a distinct
          lockup — the vessel mark, its own letterforms, letterspaced ACADEMY —
          and Fraunces standing in for it read as a different typeface next to
          the real thing.

          Statically imported so Next supplies the intrinsic dimensions and
          serves it optimised; `priority` because it is above the fold on every
          Academy screen. Height is fixed and width auto so the 575×164 ratio
          is never distorted.
        */}
        <Link
          href="/academy/my-missions"
          /*
           * WCAG 2.5.8 — the wordmark is a standalone navigation link, so it
           * needs a 44px hit area even though the artwork is 22px tall. It
           * measured 63x22 at 390px, which the inline-in-text exception does
           * not cover: it is not inside a sentence. The min-height enlarges
           * the target without changing how the logo looks.
           */
          className="inline-flex min-h-[var(--target-min)] items-center"
        >
          <Image
            src={wlaLogo}
            alt="Within Lab Academy"
            priority
            className={cn(
              "w-auto",
              /* Smaller inside Active Mission, where §17 asks the header to
                 become quieter. */
              quiet ? "h-[22px] sm:h-[26px]" : "h-[28px] sm:h-[34px]",
            )}
          />
        </Link>

        {/*
          §35 — mission identity and the two ways out, in the header.

          At phone width the title and both links did not fit beside the
          logo: the nav wrapped onto two lines and the logo floated against
          its middle (seen in the 390px render). So below `sm` the links
          share the logo's row and the title takes its own line under them;
          from `sm` up it reads as before — logo, then title and links on the
          right. One element each, reordered, so nothing is announced twice.
        */}
        {quiet && mission && (
          <>
            <span className="order-last basis-full pb-[var(--space-s)] font-[family-name:var(--font-serif)] text-[length:var(--text-h3)] leading-[var(--leading-tight)] sm:order-none sm:ml-auto sm:basis-auto sm:pb-0">
              {mission.title}
            </span>
            <nav
              aria-label="Mission"
              className="flex items-center gap-[var(--space-l)]"
            >
              <Link
                href={`/academy/missions/${mission.slug}`}
                className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
              >
                Mission Home
              </Link>
              <Link
                href={`/academy/missions/${mission.slug}/kit`}
                className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
              >
                Mission Kit
              </Link>
            </nav>
          </>
        )}

        {!quiet && (
          <div className="flex items-center gap-[var(--space-l)]">
            <ProfileSwitcher
              childProfiles={childProfiles}
              activeChildId={activeChildId}
            />
            <Link
              href="/account"
              className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
            >
              Account
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
