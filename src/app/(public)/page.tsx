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
    <main className="wla-container py-[var(--space-4xl)]">
      <h1 className="wla-measure text-[length:var(--text-display)]">
        From curious to capable, one mission at a time.
      </h1>
      <p className="wla-measure mt-[var(--space-l)] text-[var(--color-text-muted)]">
        Self-paced, screen-light missions for children aged 7–15.
      </p>
      <div className="mt-[var(--space-xl)] flex flex-wrap gap-[var(--space-m)]">
        <Link href="/try-free">
          <Button size="large">Try a Free Mission</Button>
        </Link>
        <Link href="/missions">
          <Button variant="secondary" size="large">
            View a Mission
          </Button>
        </Link>
      </div>
      <p className="mt-[var(--space-3xl)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Public-site stub — awaiting the Lovable reference implementation.
      </p>
    </main>
  );
}
