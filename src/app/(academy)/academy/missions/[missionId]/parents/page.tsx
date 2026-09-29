import Link from "next/link";
import { AcademyChrome } from "@/components/academy/academy-chrome";
import { notFound, redirect } from "next/navigation";
import { ErrorState } from "@/components/system/states";
import { ParentNote } from "@/components/academy/parent-note";
import { resolveActiveChild } from "@/features/children/active-child";
import { getMissionHome } from "@/features/missions/queries";
import { getParentNoteDocumentUrl } from "@/features/missions/resources";
import { AccessError } from "@/lib/permissions";

export const metadata = { title: "For Parents" };

/**
 * FOR PARENTS — Architecture §8 (LOCKED), UI/UX §32.
 *
 * Adult guidance, separate from Mission Kit. Not a parent dashboard.
 * Opening it must not change mission state — this route performs no writes.
 *
 * WHERE A DOCUMENT EXISTS, THIS ROUTE SERVES IT.
 *
 * The Six Names note is supplied as a print-ready PDF, and a parent preparing
 * materials is better served by that than by a page restating it. The route
 * mints a short-lived signed URL and redirects.
 *
 * Kept as a redirect rather than putting the signed URL on Mission Home: the
 * link stays a stable, bookmarkable path, authorisation is re-established on
 * every click, and no signed URL is ever embedded in another page's HTML.
 *
 * Missions without a document — and a document missing from Storage — fall
 * back to the text note. Architecture §8 requires this surface to stay
 * available, so a parent who cannot open a PDF still gets the guidance.
 */
export default async function ForParentsPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;

  const active = await resolveActiveChild().catch(() => null);
  if (!active || active.status !== "ok") notFound();

  let home;
  let documentUrl: string | null = null;
  try {
    [home, documentUrl] = await Promise.all([
      getMissionHome(active.childId, missionId),
      getParentNoteDocumentUrl(active.childId, missionId),
    ]);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    return (
      <main className="wla-container-narrow py-[var(--space-2xl)]">
        <ErrorState as="h1" title="We couldn't load this note." />
      </main>
    );
  }

  /*
   * redirect() throws by design, so it sits outside the try above — a
   * successful redirect must never be caught and reported as a failed load.
   */
  if (documentUrl) redirect(documentUrl);

  return (
    <>
      <AcademyChrome />
      <main className="wla-container-narrow py-[var(--space-2xl)]">
        <Link
          href={`/academy/missions/${home.mission.slug}`}
          className="inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
        >
          ← {home.mission.title}
        </Link>

        <h1 className="mt-[var(--space-m)] text-[length:var(--text-h1)]">
          For Parents
        </h1>

        <div className="mt-[var(--space-l)]">
          <ParentNote content={home.parentNote} />
        </div>
      </main>
    </>
  );
}
