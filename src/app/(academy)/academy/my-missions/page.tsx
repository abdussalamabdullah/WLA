import { EmptyState, ErrorState } from "@/components/system/states";
import { FormNotice } from "@/components/ui/field";
import { MissionCard } from "@/components/mission/mission-card";
import { ChildSelection } from "@/components/profile/child-selection";
import { resolveActiveChild } from "@/features/children/active-child";
import { getMissionCollection } from "@/features/missions/queries";
import { AcademyChrome } from "@/components/academy/academy-chrome";
import { PageHeader } from "@/components/ui/section";

export const metadata = { title: "My Missions" };

/**
 * MY MISSIONS — Architecture §4 (LOCKED), UI/UX §20–§23.
 *
 * The collection + status layer. Answers: what missions do I have, what was I
 * doing, where do I continue.
 *
 * Architecture §4 warns it must not become a repository for every mission
 * file, parent note or Trail item — so it shows identity, status and action,
 * and nothing else. No search or filter (deferred, Architecture §22).
 *
 * Renders the child selector rather than a mission list when the active child
 * is not yet established (Architecture §3).
 */
export default async function MyMissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string; added?: string }>;
}) {
  const { purchase, added } = await searchParams;

  let active;
  try {
    active = await resolveActiveChild();
  } catch {
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <ErrorState
          as="h1"
          title="We couldn't load your missions."
          body="Please sign in and try again."
        />
      </main>
    );
  }

  if (active.status === "no_children") {
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <Header />
        <EmptyState
          title="No child profiles yet"
          body="Add a child profile to start collecting missions."
        />
      </main>
    );
  }

  if (active.status === "needs_selection") {
    return (
      <main className="wla-container">
        <ChildSelection childProfiles={active.children} />
      </main>
    );
  }

  let collection;
  try {
    collection = await getMissionCollection(active.childId);
  } catch {
    return (
      <main className="wla-container py-[var(--space-2xl)]">
        <Header />
        <ErrorState
          title="We couldn't load these missions."
          body="Your progress is safe. Please try again."
        />
      </main>
    );
  }

  return (
    <>
      <AcademyChrome />
      <main className="wla-container py-[var(--space-2xl)]">
        <Header />

        {/*
        Returning from Stripe is NOT proof of payment (Tech Spec §40). The
        entitlement is created by the verified webhook, which may land a moment
        later. So this confirms the payment was submitted and says the mission
        will appear — it never claims the mission is already there.
      */}
        {purchase === "complete" && (
          <div className="mt-[var(--space-l)]">
            <FormNotice message="Thank you. Once the payment is confirmed, the mission appears here — refresh in a moment if you don't see it yet." />
          </div>
        )}

        {/* A free grant is already committed when we redirect, so this can say
          so plainly — unlike the Stripe return, which cannot. */}
        {added === "1" && (
          <div className="mt-[var(--space-l)]">
            <FormNotice message="Mission added." />
          </div>
        )}

        {collection.length === 0 ? (
          // Copy verbatim from the Public Website Master §7 empty state.
          <EmptyState
            title="No missions yet"
            body="Explore WLA missions or start with the free mission."
            action={{ label: "Explore Missions →", href: "/missions" }}
          />
        ) : (
          /*
          MEASURED: the site's grids run on a 32px gutter, two-up for mission
          photographs and three-up for its closing panels. A row of three
          362px cards plus two 32px gutters is exactly the 1152px container.
        */
          <ul className="mt-[var(--space-2xl)] grid gap-x-[var(--grid-gutter)] gap-y-[var(--space-2xl)] sm:grid-cols-2 lg:grid-cols-3">
            {collection.map(({ mission, status }) => (
              <MissionCard key={mission.id} mission={mission} status={status} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

/**
 * §21 — heading plus a short explanation of the page.
 *
 * The child's name is deliberately NOT repeated here. The profile control in
 * the header already answers §18's "which child's missions am I looking at?",
 * and saying it twice on one screen is duplication, not emphasis.
 */
function Header() {
  return (
    <PageHeader
      title="My Missions"
      /*
        The one editorial line on this screen — Fraunces italic in olive, as
        the site sets its hero subhead and its closing statement. It replaces
        the grey deck that was here rather than joining it: a title, an italic
        line AND a muted explanation is three supporting voices for one page.
      */
      editorial="Everything you've started, and everything still waiting."
    />
  );
}
