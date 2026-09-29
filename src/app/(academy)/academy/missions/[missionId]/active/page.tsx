import Link from "next/link";
import { AcademyChrome } from "@/components/academy/academy-chrome";
import { notFound, redirect } from "next/navigation";
import { ErrorState } from "@/components/system/states";
import { MissionRunner } from "@/components/mission/mission-runner";
import { resolveAcademyActor } from "@/features/academy/actor";
import { getStageFor } from "@/features/academy/play";
import { AccessError } from "@/lib/permissions";

/**
 * ACTIVE MISSION — Architecture §9, UI/UX §33–§35.
 *
 * The quietest surface in the product. Narrow measure, minimal chrome, cream +
 * charcoal with olive reserved for the primary action.
 *
 * STAGED INFORMATION: this page receives exactly one screen — the child's
 * current position — because `mission_screens` has no client read policy and
 * `get_current_mission_screen` returns nothing else (the screen_access
 * migration). Future
 * content is never sent to the browser, so the sequence is enforced by the
 * database rather than by this interface.
 *
 * RESUME: the position comes from the server on every render, so refresh
 * recovery and leave-and-return recovery are the same code path.
 *
 * This route MUST NEVER branch on mission identity (Tech Spec §31).
 */
export default async function ActiveMissionPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;

  const actor = await resolveAcademyActor();
  if (actor.kind !== "parent" && actor.kind !== "child") notFound();

  let stage;
  try {
    stage = await getStageFor(actor, missionId);
  } catch (error) {
    if (error instanceof AccessError) notFound();
    // The child path signals a missing entitlement by throwing plainly.
    if (error instanceof Error && error.message === "not_entitled") notFound();
    return (
      <main className="wla-container-narrow py-[var(--space-2xl)]">
        <ErrorState
          title="We couldn't load this mission."
          body="Your mission progress is safe. Please try again."
        />
      </main>
    );
  }

  const { mission, progress, screen, state } = stage;
  const base = `/academy/missions/${mission.slug}`;

  // Mission Home owns the Start action, so progress is never created by a GET.
  if (!progress || progress.status === "not_started") redirect(base);

  // Architecture §17 — a completed mission does not re-enter the doing
  // environment.
  if (progress.status === "complete") redirect(`${base}/complete`);

  return (
    <>
      {/*
        §35 — the header carries mission identity plus Mission Home and
        Mission Kit, so they sit in one consistent place and the screen itself
        stays free for the task. Leaving for either never destroys state
        (Architecture §9).
      */}
      <AcademyChrome
        variant="quiet"
        mission={{ title: mission.title, slug: mission.slug }}
      />
      <main className="wla-container-narrow py-[var(--space-2xl)]">
        <div>
          {/*
            The page's h1, for assistive technology only.

            Active Mission is deliberately the quietest surface (UI/UX §17):
            the mission's name already sits in the header, and repeating it as
            a visible heading would compete with the screen's own job. But a
            page still needs exactly one h1, and several screens — every
            handoff and every reflection — carry no title of their own.
          */}
          <h1 className="sr-only">{mission.title}</h1>

          {screen ? (
            <MissionRunner
              missionSlug={mission.slug}
              screen={screen}
              state={state}
            />
          ) : (
            <NotReady title={mission.title} homeHref={base} />
          )}
        </div>
      </main>
    </>
  );
}

/** Shown when a mission has no screens for this version. */
function NotReady({ title, homeHref }: { title: string; homeHref: string }) {
  return (
    <div>
      <h1 className="text-[length:var(--text-h1)]">{title}</h1>
      <p className="wla-measure mt-[var(--space-m)] text-[var(--color-text-muted)]">
        This mission isn&rsquo;t ready to start yet. Its Mission Kit and parent
        note are already available.
      </p>
      <Link
        href={homeHref}
        className="mt-[var(--space-l)] inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
      >
        ← Back to Mission Home
      </Link>
    </div>
  );
}
