import Link from "next/link";
import { AcademyChrome } from "@/components/academy/academy-chrome";
import { notFound } from "next/navigation";
import {
  EmptyState,
  ErrorState,
  UnavailableState,
} from "@/components/system/states";
import { ResourceItem } from "@/components/mission/resource-item";
import { resolveActiveChild } from "@/features/children/active-child";
import { getMissionHome } from "@/features/missions/queries";
import { getMissionKit } from "@/features/missions/resources";
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

  const active = await resolveActiveChild().catch(() => null);
  if (!active || active.status !== "ok") notFound();

  let home;
  let kit;
  try {
    // Kit access is entitlement-gated and mints a short-lived signed URL per
    // resource; a missing file degrades to its unavailable state (UI/UX §56).
    [home, kit] = await Promise.all([
      getMissionHome(active.childId, missionId),
      getMissionKit(active.childId, missionId),
    ]);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <ErrorState title="We couldn't load the Mission Kit." />
      </main>
    );
  }

  const { mission } = home;

  return (
    <>
      <AcademyChrome />
      <main className="wla-container py-[var(--space-2xl)] md:py-[var(--space-3xl)]">
        <Link
          href={`/academy/missions/${mission.slug}`}
          className="text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
        >
          ← {mission.title}
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
            {kit.length === 0 ? (
              <EmptyState
                title="No materials for this mission"
                body="This mission doesn't need anything printed."
              />
            ) : kit.every((item) => item.url === null) ? (
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
                {kit.map(({ resource, url }) => (
                  <ResourceItem
                    key={resource.id}
                    resource={resource}
                    url={url}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
