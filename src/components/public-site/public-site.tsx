import Image from "next/image";
import Link from "next/link";
import wlaLogo from "../../../public/wla-logo-horizontal.png";
import { LabIcon } from "@/components/mission/lab-icon";
import { MetaList } from "@/components/ui/section";
import { LAB_LABEL, LAB_TAGLINE } from "@/features/missions/labs";
import { resolveMissionCover } from "@/features/missions/covers";
import type { PublicMissionEntry } from "@/features/public-site/catalogue";
import { cn } from "@/lib/utils";

/**
 * Building blocks for the TEMPORARY public Missions pages (D-109), set from
 * the Lovable captures. Public-site scope only — the Academy never renders
 * these, and Mission Home is not built from them (UI/UX §69).
 */

/** The site's secondary action: small text, underline, trailing arrow. */
export function ArrowLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-[var(--target-min)] items-center gap-[6px] text-[length:var(--text-small)] text-[color:var(--color-text-action)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]",
        className,
      )}
    >
      {children}
      <span aria-hidden>→</span>
    </Link>
  );
}

/** "Ages 11–15 · 60–75 mins · Hybrid" — duration only when the row gives one. */
export function publicMetaParts(
  mission: PublicMissionEntry,
  duration: string | null,
): string[] {
  return [
    `Ages ${mission.minAge}–${mission.maxAge}`,
    duration ?? "",
    mission.delivery,
  ];
}

/** The Lab glyph and name, as the site sets them above a mission title. */
export function LabLine({
  lab,
  size = "small",
}: {
  lab: PublicMissionEntry["lab"];
  size?: "small" | "large";
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-[var(--space-s)] text-[var(--color-text-muted)]",
        size === "large"
          ? "text-[length:var(--text-body)]"
          : "text-[length:var(--text-label)]",
      )}
    >
      <LabIcon lab={lab} size={size === "large" ? 22 : 16} />
      {LAB_LABEL[lab]}
    </p>
  );
}

/**
 * The Explore missions card. MEASURED from the capture: a 4:3 photograph
 * flush to the top of a lighter, hairline-bordered panel, then Lab, title,
 * serif headline, deck, Lab tagline, a rule, meta, and one text action.
 *
 * The card itself is not a link: "See Mission" is the one action, so a
 * keyboard user meets one stop per mission rather than a nested pair.
 */
export function PublicMissionCard({
  mission,
  duration,
}: {
  mission: PublicMissionEntry;
  duration: string | null;
}) {
  const cover = resolveMissionCover({
    slug: mission.slug,
    title: mission.title,
    cover_image: null,
  });
  const tagline = LAB_TAGLINE[mission.lab];
  const headingId = `mission-${mission.slug}`;

  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        {cover && (
          <div className="relative aspect-[4/3] w-full">
            <Image
              src={cover.src}
              alt={cover.alt}
              fill
              sizes="(min-width: 768px) 560px, 100vw"
              className="object-cover"
            />
          </div>
        )}
        <div className="flex flex-1 flex-col p-[var(--space-l)] md:px-[var(--space-xl)] md:pt-[var(--space-l)] md:pb-[var(--space-m)]">
          <LabLine lab={mission.lab} />
          <h3
            id={headingId}
            className="mt-[var(--space-s)] text-[length:var(--text-h2)]"
          >
            {mission.title}
          </h3>
          <p className="mt-[var(--space-m)] font-[family-name:var(--font-serif)] text-[length:var(--text-body)] leading-[var(--leading-normal)]">
            {mission.headline}
          </p>
          <p className="mt-[var(--space-s)] text-[length:var(--text-small)] leading-[var(--leading-relaxed)] text-[var(--color-text-muted)]">
            {mission.deck}
          </p>
          {tagline && (
            <p className="mt-[var(--space-m)] text-[length:var(--text-label)] font-medium">
              {tagline}
            </p>
          )}
          <hr className="wla-rule mt-[var(--space-m)]" />
          <MetaList
            className="mt-[var(--space-m)] text-[length:var(--text-label)]"
            items={publicMetaParts(mission, duration)}
          />
          <div className="mt-auto pt-[var(--space-s)]">
            <ArrowLink
              href={`/missions/${mission.slug}`}
              className="no-underline hover:underline"
            >
              See Mission
              <span className="sr-only">: {mission.title}</span>
            </ArrowLink>
          </div>
        </div>
      </article>
    </li>
  );
}

/**
 * The public footer, from the captures and Public Website Master §9.
 *
 * Only links with a destination in this app are drawn. FAQs, Contact, the
 * whole Trust & Legal group and the WhatsApp / Telegram links have no route
 * or URL yet; an invented href would be a dead end, so they are omitted
 * rather than faked (D-109).
 */
const FOOTER_GROUPS = [
  {
    heading: "Missions",
    links: [
      { label: "Explore Missions", href: "/missions" },
      { label: "Try a Free Mission", href: "/try-free" },
      { label: "Buy a Gift", href: "/gift" },
      { label: "Redeem a Gift", href: "/redeem" },
    ],
  },
  {
    heading: "Explore",
    links: [
      { label: "Labs", href: "/labs" },
      { label: "Journal", href: "/journal" },
      { label: "About", href: "/about" },
    ],
  },
  {
    heading: "Families",
    links: [
      { label: "My Missions", href: "/academy/my-missions" },
      { label: "Reviews", href: "/reviews" },
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-background)]">
      <div className="wla-container wla-split py-[var(--space-3xl)]">
        <div className="lg:col-span-5">
          <Link
            href="/"
            className="inline-flex min-h-[var(--target-min)] items-center"
          >
            <Image
              src={wlaLogo}
              alt="Within Lab Academy"
              className="h-[34px] w-auto"
            />
          </Link>
        </div>
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-[var(--space-xl)] sm:grid-cols-3 lg:col-span-7"
        >
          {FOOTER_GROUPS.map((group) => (
            <div key={group.heading}>
              <h2 className="font-[family-name:var(--font-serif)] text-[length:var(--text-eyebrow)] uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-text-muted)]">
                {group.heading}
              </h2>
              <ul className="mt-[var(--space-s)]">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] hover:underline hover:underline-offset-4"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="border-t border-[var(--color-border)] pt-[var(--space-l)] text-[length:var(--text-label)] text-[var(--color-text-muted)] lg:col-span-12">
          © 2026 Within Lab Academy. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
