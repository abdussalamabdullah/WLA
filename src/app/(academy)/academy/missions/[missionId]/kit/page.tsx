import Link from "next/link";
import { AcademyShell } from "@/components/academy/academy-shell";
import { notFound } from "next/navigation";
import {
  EmptyState,
  ErrorState,
  UnavailableState,
} from "@/components/system/states";
import { ResourceItem } from "@/components/mission/resource-item";
import { resolveAcademyActor } from "@/features/academy/actor";
import { getKitFor, recordKitOpenedFor } from "@/features/academy/play";
import { AccessError } from "@/lib/permissions";

export const metadata = { title: "Mission Kit" };

/**
 * MISSION KIT — Architecture §7 (LOCKED), UI/UX §29–§31.
 *
 * What WLA GIVES the child. Never the child's own evidence — that is Mission
 * Trail, and Brief §17 requires the two never collapse into one "files" area.
 *
 * HARD RULE: this route performs NO writes. Opening, printing or downloading
 * a resource must not alter mission progress (Architecture §7).
 *
 * Available in every status, including Complete.
 */
export default async function MissionKitPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;

  const actor = await resolveAcademyActor();
  if (actor.kind !== "parent" && actor.kind !== "child") notFound();

  let kit;
  try {
    /*
     * Entitlement-gated for both actors, at the version the child's run is
     * pinned to (D-63). A parent gets signed URLs minted with their own
     * session; a child gets links to /api/kit/<id>, which re-authorises on
     * every click (D-64). A missing file degrades to unavailable (UI/UX §56).
     */
    kit = await getKitFor(actor, missionId);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <ErrorState as="h1" title="We couldn't load the Mission Kit." />
      </main>
    );
  }

  // Outside the try — notFound() throws, and the catch would swallow it.
  if (!kit) notFound();

  // §13: Mission Kit use during an active run. Never blocks the Kit.
  await recordKitOpenedFor(actor, missionId, "page");


  return (
    <AcademyShell>
      <main className="wla-container py-[var(--space-2xl)] md:py-[var(--space-3xl)]">
        <Link
          href={`/academy/missions/${missionId}`}
          className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
        >
          ← {kit.missionTitle}
        </Link>

        {/*
          The site's section arrangement: the heading and its explanation hold
          the left five columns, the list of things itself holds the right
          seven. It is the same shape the public site gives its FAQ, and for
          the same reason — the list is the content, and the heading is a label
          for it rather than a lid on top of it.
        */}
        <div className="wla-split mt-[var(--space-xl)]">
          <div className="lg:col-span-5">
            <h1 className="text-[length:var(--text-h1)]">Mission Kit</h1>
            <p className="wla-measure mt-[var(--space-m)] text-[var(--color-text-muted)]">
              Everything WLA provides for this mission. These stay here before,
              during and after.
            </p>
          </div>

          <div className="lg:col-span-7">
            {kit.items.length === 0 ? (
              <EmptyState
                title="No materials for this mission"
                body="This mission doesn't need anything printed."
              />
            ) : kit.items.every((item) => item.href === null) ? (
              /*
               * Every file failed to produce a signed URL — the assets are
               * missing from Storage. UI/UX §56: say it is unavailable, do NOT
               * imply the child's progress is lost, and offer a way to retry.
               * Distinct from "no materials", which is a mission that needs
               * none.
               */
              <UnavailableState title="These materials aren't available right now." />
            ) : (
              <ul className="border-t border-[var(--color-border)]">
                {kit.items.map((item) => (
                  <ResourceItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </AcademyShell>
  );
}
