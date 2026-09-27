import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * STUB. Public-site copy is owned by the Public Website Master, and the Brief
 * (§2.1) directs that the existing Lovable design be refined rather than
 * rebuilt. This page exists only so the public → Academy journey is walkable.
 * See docs/DECISIONS.md → OPEN-01.
 */
export default function HomePage() {
  return (
    <main className="wla-container py-[var(--space-3xl)] md:py-[var(--space-5xl)]">
      {/*
        The hero, set to the measured values rather than approximated: 60px
        Fraunces on a 65px line (a ratio of 1.08, far tighter than the 1.15
        used below it), then the italic subhead in olive, then the dot-
        separated facts. See docs/DESIGN-LANGUAGE §3.

        NO PHOTOGRAPH. The real hero is a full-bleed image of wooden blocks on
        a tilting plank, and it has not been handed over. A stock substitute
        would be worse than none, so the type carries the page alone.
      */}
      <h1 className="wla-display max-w-[16ch]">
        From curious to capable, one mission at a time.
      </h1>

      <p className="wla-editorial mt-[var(--space-l)] text-[length:var(--text-h3)]">
        A place to try, get it wrong, and try again.
      </p>

      <p className="mt-[var(--space-l)] text-[var(--color-text-muted)]">
        Self-paced
        <Dot />
        Screen-light
        <Dot />
        Ages 7–15
      </p>

      {/*
        One pill, one text link. The public site puts a single olive CTA on a
        page and makes every other action an underlined link with an arrow; two
        large buttons side by side would read as two equal choices.
      */}
      <div className="mt-[var(--space-2xl)] flex flex-wrap items-center gap-[var(--space-l)]">
        <Link href="/try-free">
          <Button size="large">Try a Free Mission →</Button>
        </Link>
        <Link
          href="/missions"
          className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-small)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
        >
          View a Mission →
        </Link>
      </div>

      <p className="mt-[var(--space-5xl)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Public-site stub — awaiting the Lovable reference implementation.
      </p>
    </main>
  );
}

/** The site's meta separator: a middot with air on either side. */
function Dot() {
  return (
    <span
      aria-hidden
      className="mx-[var(--space-meta)] text-[var(--color-border-strong)]"
    >
      ·
    </span>
  );
}
