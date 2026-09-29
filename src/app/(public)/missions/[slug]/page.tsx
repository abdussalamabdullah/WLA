import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

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
 *
 * Only a PUBLISHED mission has a detail page. Before, any slug rendered —
 * including an unpublished mission, with a "Get this mission" button. RLS
 * (`published missions are readable`) is what decides; this page asks it.
 */
export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const supabase = await createClient();
  const { data: mission } = await supabase
    .from("missions")
    .select("slug, title")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!mission) notFound();

  return (
    <main className="wla-container py-[var(--space-4xl)]">
      <h1 className="text-[length:var(--text-h1)]">{mission.title}</h1>
      <p className="wla-measure mt-[var(--space-m)] text-[var(--color-text-muted)]">
        Mission Detail stub — marketing copy, imagery and pricing come from the
        Public Website Master.
      </p>

      <div className="mt-[var(--space-xl)]">
        {/* Price is shown on the purchase page, read from the mission row. */}
        <ButtonLink href={`/purchase/${mission.slug}`} size="large">
          Get this mission
        </ButtonLink>
      </div>
    </main>
  );
}
