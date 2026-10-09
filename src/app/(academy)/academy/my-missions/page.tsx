import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getChildToken } from "@/lib/child-session";
import { EmptyState, ErrorState } from "@/components/system/states";
import { FormNotice } from "@/components/ui/field";
import { ChildSelection } from "@/components/profile/child-selection";
import { AcademyShell } from "@/components/academy/academy-shell";
import {
  MissionCollection,
  type CollectionItem,
} from "@/components/academy/mission-collection";
import { resolveAcademyActor } from "@/features/academy/actor";
import { getCollectionFor } from "@/features/academy/collection";
import { LAB_LABEL } from "@/features/missions/labs";
import { resolveMissionCover } from "@/features/missions/covers";
import { cn } from "@/lib/utils";

export const metadata = { title: "My Missions" };

/**
 * MY MISSIONS — Architecture §4 (LOCKED), UI/UX §20–§23, LMS brief §8.
 *
 * Still the collection + status layer, and still not a dashboard or a file
 * store. What changed is that it now has to stay legible at 20+ missions, so
 * it gained a Continue section, status tabs, Lab and age filters and search
 * (D-60). What it did NOT gain is anything new to know about a mission: the
 * card shows identity, status and one action, exactly as before.
 *
 * Serves both learner actors through `resolveAcademyActor`. A child sees the
 * same page; the data comes from their own session rather than from the
 * parent's selected child.
 */
export default async function MyMissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string; added?: string; owned?: string }>;
}) {
  const { purchase, added, owned } = await searchParams;

  let actor;
  try {
    actor = await resolveAcademyActor();
  } catch {
    return (
      <Frame>
        <ErrorState
          as="h1"
          title="We couldn't load your missions."
          body="Your progress is safe. Please try again."
        />
      </Frame>
    );
  }

  if (actor.kind === "anonymous") {
    /*
     * Send them where they can get back in, rather than a dead end. Found in
     * staging QA: when a parent turned off a code, the child's session ended
     * correctly but the child — still holding the dead cookie, so the
     * middleware let them through — was told "Please sign in" with no way to.
     */
    redirect((await getChildToken()) ? "/child/login" : "/login?next=/academy/my-missions");
  }

  if (actor.kind === "parent_no_children") {
    return (
      <AcademyShell>
        <Frame>
          <PageTitle name={null} />
          <EmptyState
            title="No child profiles yet"
            body="Add a child profile to start collecting missions."
          />
          <Link
            href="/account/children/new"
            className="mt-[var(--space-l)] inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
          >
            Add a child →
          </Link>
        </Frame>
      </AcademyShell>
    );
  }

  if (actor.kind === "parent_needs_child") {
    return (
      <AcademyShell>
        <Frame>
          {/* ChildSelection carries the page's h1 and its one instruction. */}
          <ChildSelection childProfiles={actor.children} />
        </Frame>
      </AcademyShell>
    );
  }

  const collection = await getCollectionFor(actor);

  const items: CollectionItem[] = collection.map(({ mission, status, lastActivityAt }) => ({
    slug: mission.slug,
    title: mission.title,
    lab: mission.lab,
    labLabel: LAB_LABEL[mission.lab],
    minAge: mission.min_age,
    maxAge: mission.max_age,
    coverImage: resolveMissionCover(mission)?.src ?? null,
    status,
    lastActivityAt,
  }));

  // §8: "Show one or two active missions." Two, not more — Continue is a way
  // back in, not a second collection.
  const continuing = items.filter((i) => i.status === "in_progress").slice(0, 2);

  const name =
    actor.kind === "child" ? actor.session.displayName : await parentChildName(actor.childId);

  return (
    <AcademyShell>
      <Frame>
        {/*
          * The browser's return from Stripe is NOT proof of payment — only the
          * signed webhook is. So this says the mission WILL appear, never that
          * it has. A guard in features/commerce asserts this wording, and it
          * caught this exact claim being weakened during the LMS redesign.
          */}
        {purchase === "success" && (
          <div className="mb-[var(--space-l)]">
            <FormNotice message="Thank you. Once the payment is confirmed, this mission will appear here." />
          </div>
        )}
        {/* It read `${added} can now be given missions.` — "1 can now be
            given missions." — since the only sender is the free grant. */}
        {added && (
          <div className="mb-[var(--space-l)]">
            <FormNotice message="The mission has been added." />
          </div>
        )}
        {owned && (
          <div className="mb-[var(--space-l)]">
            <FormNotice message="This mission is already in My Missions." />
          </div>
        )}

        <PageTitle name={name} />

        {continuing.length > 0 && <ContinueSection items={continuing} />}

        <MissionCollection items={items} />

        {/*
          Mission Board — Architecture §16 as amended by the Enhancement Plan
          (D-73): beneath the child's mission collection, visually secondary to
          it, and never a step in the mission journey. It used to sit on Mission
          Home; the plan names this one placement.
        */}
        <section aria-labelledby="mission-board-link" className="mt-[var(--space-2xl)] border-t border-[var(--color-border)] pt-[var(--space-l)]">
          <h2 id="mission-board-link" className="text-[length:var(--text-h3)]">Mission Board</h2>
          <p className="mt-[var(--space-xs)] wla-measure text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            Different ways WLA children have approached a mission. Optional.
          </p>
          <Link
            href="/academy/mission-board"
            className="mt-[var(--space-s)] inline-flex min-h-[var(--target-min)] items-center text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)]"
          >
            Open Mission Board →
          </Link>
        </section>
      </Frame>
    </AcademyShell>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="wla-container py-[var(--space-2xl)]">{children}</main>
  );
}

function PageTitle({ name }: { name: string | null }) {
  return (
    <div>
      <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)]">
        {name ? `Hi ${name},` : "My Missions"}
      </h1>
      <p className="mt-[var(--space-s)] wla-measure text-[var(--color-text-muted)]">
        Here are your missions.
      </p>
    </div>
  );
}

/**
 * CONTINUE — §8. The one thing a returning learner most likely wants.
 *
 * Wider and warmer than a collection card on purpose: it is a single resumption
 * point, not another thing to compare. Lands above the collection so that
 * "where do I continue?" is answered before "what else do I have?".
 */
function ContinueSection({ items }: { items: CollectionItem[] }) {
  return (
    <section className="mt-[var(--space-xl)]">
      <h2 className="text-[length:var(--text-h3)]">Continue</h2>
      <p className="mt-[2px] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
        Pick up where you left off.
      </p>

      <ul className="mt-[var(--space-m)] grid gap-[var(--space-m)] sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.slug}>
            <Link
              href={`/academy/missions/${i.slug}`}
              className={cn(
                "group flex items-center gap-[var(--space-m)]",
                "rounded-[var(--radius-surface)] border border-[var(--color-border-strong)]",
                "bg-[var(--color-surface-raised)] p-[var(--space-s)]",
                "transition-colors hover:bg-[var(--color-surface-sage)]",
              )}
            >
              {/*
                D-39 — no stand-in when a mission has no artwork. At 84px a
                tinted square is small enough to read as a broken image rather
                than as a deliberate blank, so it is simply omitted.
              */}
              {i.coverImage && (
                <div className="relative size-[84px] shrink-0 overflow-hidden rounded-[var(--radius-surface)]">
                  <Image src={i.coverImage} alt="" fill sizes="84px" className="object-cover" />
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-[family-name:var(--font-serif)] text-[length:var(--text-h3)] leading-tight">
                  {i.title}
                </h3>
                <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                  {i.labLabel}
                  {i.lastActivityAt && <> · {relativeDay(i.lastActivityAt)}</>}
                </p>
                <span className="mt-[var(--space-xs)] inline-block text-[length:var(--text-label)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4 group-hover:decoration-[var(--color-primary)]">
                  Continue Mission →
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Today" / "Yesterday" / "3 days ago" / a date. Calm, not a live timer. */
function relativeDay(iso: string): string {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The selected child's name, for the greeting. Ownership is re-verified. */
async function parentChildName(childId: string): Promise<string | null> {
  const { requireOwnedChild } = await import("@/lib/permissions");
  try {
    const { child } = await requireOwnedChild(childId);
    return child.display_name;
  } catch {
    return null;
  }
}
