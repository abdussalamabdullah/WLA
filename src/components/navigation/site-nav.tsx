import Image from "next/image";
import Link from "next/link";
import wlaLogo from "../../../public/wla-logo-horizontal.png";

/**
 * PUBLIC SITE NAVIGATION
 *
 * Structure per decision D-06 (see docs/DECISIONS.md → C1). The Public Website
 * Master is the public-site structure authority, is the later document, and
 * states it has already reconciled with the locked Academy decisions — so its
 * grouping wins over the older nav line in Architecture §1.
 *
 * Routes are identical either way; only grouping and labels differ.
 */

export const PRIMARY_NAV = [
  { label: "Home", href: "/" },
  { label: "Missions", href: "/missions" },
  { label: "Labs", href: "/labs" },
  { label: "About", href: "/about" },
] as const;

/** Architecture §1 keeps these OUT of primary marketing navigation. */
export const FUNCTIONAL_NAV = [
  { label: "My Missions", href: "/academy/my-missions" },
  { label: "Try a Free Mission", href: "/try-free" },
  { label: "View a Mission", href: "/missions" },
] as const;

/** Master copy groups these under "More". Placement is locked; copy is not. */
export const MORE_NAV = [
  { label: "Journal", href: "/journal" },
  { label: "Reviews", href: "/reviews" },
  { label: "Buy a Gift", href: "/gift" },
  { label: "Redeem a Gift", href: "/redeem" },
] as const;

export function SiteNav() {
  return (
    /*
      MEASURED from the public site: the header sits on its own lighter band
      above the canvas, about 80px tall, with a hairline beneath it.
    */
    <header className="wla-band-raised border-b border-[var(--color-border)]">
      <nav
        aria-label="Primary"
        className="wla-container flex min-h-[80px] flex-wrap items-center justify-between gap-[var(--space-m)]"
      >
        {/*
          The real lockup, not Fraunces set to resemble it. The public site
          shows the logo here, and type standing in for it read as a different
          typeface sitting next to the genuine article on every other surface.
        */}
        <Link href="/" className="flex items-center">
          <Image
            src={wlaLogo}
            alt="Within Lab Academy"
            priority
            className="h-[28px] w-auto sm:h-[34px]"
          />
        </Link>

        <ul className="flex flex-wrap items-center gap-[var(--space-l)]">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] hover:text-[var(--color-primary)]"
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            {/*
              MEASURED: on the site this is the one bordered control on the
              page — a rounded rectangle at about 4px, NOT a pill and not olive
              text. It is how the site separates "go to your own account" from
              the marketing links beside it.
            */}
            <Link
              href="/academy/my-missions"
              className="inline-flex min-h-[var(--target-min)] items-center rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-m)] text-[length:var(--text-small)] font-medium hover:border-[var(--color-border-strong)]"
            >
              My Missions
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
