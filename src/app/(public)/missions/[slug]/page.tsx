import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * STUB — public Mission Detail.
 *
 * UI/UX §69 is explicit: this page answers "do I want this mission?" and must
 * NOT be reused as Mission Home, which answers "I have it — what now?".
 *
 * Marketing copy and imagery are owned by the Public Website Master and are
 * not authored here (D-02). What IS wired is the purchase entry point, so the
 * Mission Detail → Checkout → entitlement → My Missions journey is walkable
 * end to end (Brief §48).
 */
export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="wla-container py-[var(--space-4xl)]">
      <h1 className="text-[length:var(--text-h1)]">{slug}</h1>
      <p className="wla-measure mt-[var(--space-m)] text-[var(--color-text-muted)]">
        Mission Detail stub — marketing copy, imagery and pricing come from the
        Public Website Master.
      </p>

      <div className="mt-[var(--space-xl)]">
        {/* Price is shown on the purchase page, read from the mission row. */}
        <Link href={`/purchase/${slug}`}>
          <Button size="large">Get this mission</Button>
        </Link>
      </div>
    </main>
  );
}
