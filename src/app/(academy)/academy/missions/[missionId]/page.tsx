import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StartMissionButton } from "@/components/mission/start-mission-button";
import { ErrorState } from "@/components/system/states";
import { MissionIdentity } from "@/components/mission/mission-identity";
import { resolveActiveChild } from "@/features/children/active-child";
import { getMissionHome } from "@/features/missions/queries";
import { AccessError } from "@/lib/permissions";

/**
 * MISSION HOME — Architecture §5 (LOCKED), UI/UX §24–§28.
 *
 * The permanent home for one mission. Exists before, during and after
 * completion; never restarts the mission automatically (Architecture §17).
 *
 * LOCKED HIERARCHY (Architecture §5, UI/UX §25):
 *   1. mission identity
 *   2. Start / Continue Mission     ← the strongest action
 *   3. Mission Kit · For Parents    ← accessible but clearly subordinate
 *
 * The action label is derived from status, never from which route the child
 * arrived through.
 */
export default async function MissionHomePage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;

  const active = await resolveActiveChild().catch(() => null);
  if (!active || active.status !== "ok") {
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <ErrorState
          title="Choose a child first."
          body="Mission access belongs to a child profile."
        />
      </main>
    );
  }

  let home;
  try {
    home = await getMissionHome(active.childId, missionId);
  } catch (error) {
    // Tech Spec §26: if entitlement fails, do NOT render the mission
    // experience. A 404 also avoids confirming that the mission exists.
    if (error instanceof AccessError) {
      if (error.reason === "not_entitled" || error.reason === "not_found") {
        notFound();
      }
    }
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <ErrorState
          title="We couldn't load this mission."
          body="Your mission progress is safe. Please try again."
        />
      </main>
    );
  }

  const { mission, status } = home;
  const base = `/academy/missions/${mission.slug}`;

  // Architecture §6 — the three states of the primary action.
  // Start and Continue both mutate (they create or touch progress), so both go
  // through the server action. Complete is read-only and stays a link.
  const primaryLabel =
    status === "not_started" ? "Start Mission →" : "Continue Mission →";

  return (
    <main className="wla-container py-[var(--space-2xl)]">
      <MissionIdentity mission={mission} status={status} />

      {/* 2. The strongest action. Nothing below may compete with it. */}
      <div className="mt-[var(--space-xl)]">
        {status === "complete" ? (
          <Link href={`${base}/trail`}>
            <Button size="large">View Mission Trail →</Button>
          </Link>
        ) : (
          <StartMissionButton missionSlug={mission.slug} label={primaryLabel} />
        )}

        {status === "in_progress" && (
          <p className="mt-[var(--space-sm)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            You&rsquo;ll go back to where you stopped.
          </p>
        )}
        {status === "complete" && (
          <p className="mt-[var(--space-sm)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            You finished this one. It stays here, and so does everything you
            made.
          </p>
        )}
      </div>

      {/* 3. Subordinate. Available in every status, including Complete
             (Architecture §7, §8, §17). Plain sections rather than cards —
             Brief §34: "Do not default to cards." */}
      <div className="mt-[var(--space-3xl)] grid gap-[var(--space-xl)] border-t border-[var(--color-border)] pt-[var(--space-xl)] md:grid-cols-2">
        <section>
          <h2 className="text-[length:var(--text-h3)]">Mission Kit</h2>
          <p className="mt-[var(--space-xs)] text-[var(--color-text-muted)]">
            Everything you&rsquo;ll need for this mission.
          </p>
          <Link
            href={`${base}/kit`}
            className="mt-[var(--space-sm)] inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
          >
            Open Mission Kit
          </Link>
        </section>

        <section>
          <h2 className="text-[length:var(--text-h3)]">For Parents</h2>
          <p className="mt-[var(--space-xs)] text-[var(--color-text-muted)]">
            A short note about helping your child get started.
          </p>
          <Link
            href={`${base}/parents`}
            className="mt-[var(--space-sm)] inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
          >
            Read the parent note
          </Link>
        </section>
      </div>
    </main>
  );
}
