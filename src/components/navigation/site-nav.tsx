import Link from "next/link";

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
    <header className="border-b border-[var(--color-border)]">
      <nav
        aria-label="Primary"
        className="wla-container flex min-h-[72px] flex-wrap items-center justify-between gap-[var(--space-m)]"
      >
        <Link
          href="/"
          className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)]"
        >
          Within Lab
        </Link>

        <ul className="flex flex-wrap items-center gap-[var(--space-l)]">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)]"
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/academy/my-missions"
              className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] text-[var(--color-primary)]"
            >
              My Missions
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
