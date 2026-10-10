import {
  ArrowLink,
  PublicMissionCard,
} from "@/components/public-site/public-site";
import { ButtonLink } from "@/components/ui/button";
import { PUBLIC_MISSIONS } from "@/features/public-site/catalogue";
import { getPublicMissionFacts } from "@/features/public-site/queries";

export const metadata = { title: "Missions" };

/**
 * TEMPORARY Missions page — a stand-in for the Lovable site (D-109), set from
 * `WLA- Mission.jpg`. Discovery only: nothing here reads or grants access, and
 * every route into a mission goes through its detail page and `/purchase`.
 *
 * Colour MEASURED from the capture: this version of the site sets its canvas
 * at the lighter raised tone and drops to Warm Cream for its quieter bands.
 */
export default async function MissionsPage() {
  const facts = await Promise.all(
    PUBLIC_MISSIONS.map((m) => getPublicMissionFacts(m.slug)),
  );

  return (
    <main className="wla-band-raised">
      <section className="wla-container pt-[var(--space-3xl)] pb-[var(--space-3xl)] md:pb-[var(--space-section)]">
        <h1 className="wla-display">Choose a mission.</h1>
        <div className="wla-prose mt-[var(--space-l)] max-w-[34rem] text-[length:var(--text-body)] text-[var(--color-text-muted)]">
          <p>
            A WLA mission gives your child a real problem or situation to work
            through, at their own pace.
          </p>
          <p>
            Start with what catches their interest, or choose the kind of
            practice that feels useful right now.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="free-mission"
        className="wla-section wla-band-sage"
      >
        <div className="wla-container wla-split lg:items-center">
          <div className="lg:col-span-5">
            <p className="text-[length:var(--text-eyebrow)] uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-text-muted)]">
              Try WLA
            </p>
            <h2
              id="free-mission"
              className="mt-[var(--space-s)] text-[length:var(--text-h1)]"
            >
              Free Mission
            </h2>
          </div>
          <div className="lg:col-span-7">
            <p className="text-[length:var(--text-body)]">
              Try a real mission first.
            </p>
            <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              See how WLA feels, then decide what comes next.
            </p>
            <ButtonLink href="/try-free" className="mt-[var(--space-l)]">
              Try a Free Mission
            </ButtonLink>
          </div>
        </div>
      </section>

      <section aria-labelledby="explore" className="wla-section">
        <div className="wla-container">
          <h2 id="explore" className="text-[length:var(--text-h1)]">
            Explore missions
          </h2>
          <ul className="mt-[var(--space-xl)] grid gap-[var(--space-l)] md:grid-cols-2">
            {PUBLIC_MISSIONS.map((mission, i) => (
              <PublicMissionCard
                key={mission.slug}
                mission={mission}
                duration={facts[i]?.duration ?? null}
              />
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="practice"
        className="wla-section bg-[var(--color-background)]"
      >
        <div className="wla-container wla-split">
          <h2
            id="practice"
            className="text-[length:var(--text-h1)] lg:col-span-5"
          >
            Different kinds of practice.
          </h2>
          <div className="lg:col-span-7">
            <p className="text-[length:var(--text-body)]">
              Not sure which mission fits?
            </p>
            <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
              Explore the five Labs to see the different ways children
              practise.
            </p>
            <ArrowLink href="/labs" className="mt-[var(--space-s)]">
              Explore the five Labs
            </ArrowLink>
          </div>
        </div>
      </section>

      <section aria-labelledby="gift" className="wla-section">
        <div className="wla-container">
          <div className="flex flex-col gap-[var(--space-l)] rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-l)] md:flex-row md:items-center md:justify-between md:p-[var(--space-xl)]">
            <div>
              <h2 id="gift" className="text-[length:var(--text-h3)]">
                Gift a mission
              </h2>
              <p className="mt-[var(--space-s)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Give a child something real to try.
              </p>
              <p className="mt-[var(--space-xs)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
                Buy a mission and send it to their parent or guardian.
              </p>
            </div>
            <ButtonLink href="/gift" className="self-start md:self-auto">
              Buy a Gift <span aria-hidden>→</span>
            </ButtonLink>
          </div>
        </div>
      </section>
    </main>
  );
}
