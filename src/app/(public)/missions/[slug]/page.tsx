import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowLink,
  LabLine,
  publicMetaParts,
} from "@/components/public-site/public-site";
import { ButtonLink } from "@/components/ui/button";
import { MetaList } from "@/components/ui/section";
import { resolveMissionCover } from "@/features/missions/covers";
import { findPublicMission } from "@/features/public-site/catalogue";
import { getPublicMissionFacts } from "@/features/public-site/queries";

/**
 * TEMPORARY public Mission Detail — a stand-in for the Lovable site (D-109),
 * set from `WLA- Six names.jpg`.
 *
 * UI/UX §69: this page answers "do I want this mission?" and must NOT be
 * reused as Mission Home, which answers "I have it — what now?". Nothing here
 * opens, starts or unlocks a mission.
 *
 * WHICH pages exist is the public catalogue's decision, as it is on Lovable:
 * an unknown slug 404s and the heading always comes from the entry, never the
 * URL. Whether the mission can be BOUGHT is still the database's decision —
 * price and duration appear only when RLS shows a published row, and the CTA
 * leads to `/purchase/<slug>`, which refuses an unpublished mission.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: findPublicMission(slug)?.title ?? "Mission" };
}

export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const mission = findPublicMission(slug);
  if (!mission) notFound();

  const facts = await getPublicMissionFacts(mission.slug);
  const cover = resolveMissionCover({
    slug: mission.slug,
    title: mission.title,
    cover_image: null,
  });
  const priceLabel = facts?.priceLabel ?? null;

  return (
    <main className="wla-band-raised">
      <section className="wla-container pt-[var(--space-2xl)] pb-[var(--space-3xl)] md:pb-[var(--space-4xl)]">
        <ArrowLink href="/missions" className="no-underline hover:underline">
          All missions
        </ArrowLink>

        <div className="wla-split mt-[var(--space-l)] lg:items-center">
          <div className="lg:col-span-6">
            <h1 className="wla-display">{mission.title}</h1>
            <div className="mt-[var(--space-m)]">
              <LabLine lab={mission.lab} size="large" />
            </div>
            <MetaList
              className="mt-[var(--space-s)] text-[length:var(--text-label)]"
              items={publicMetaParts(mission, facts?.duration ?? null)}
            />
            <p className="mt-[var(--space-xl)] font-[family-name:var(--font-serif)] text-[length:var(--text-h3)] leading-[var(--leading-tight)] md:text-[length:var(--text-h2)]">
              {mission.headline}
            </p>
            <p className="mt-[var(--space-m)] max-w-[36rem] text-[length:var(--text-body)] leading-[var(--leading-relaxed)] text-[var(--color-text-muted)]">
              {mission.deck}
            </p>
          </div>
          {cover && (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-surface)] lg:col-span-6">
              <Image
                src={cover.src}
                alt={cover.alt}
                fill
                priority
                sizes="(min-width: 1024px) 560px, 100vw"
                className="object-cover"
              />
            </div>
          )}
        </div>
      </section>

      <section
        aria-label={`About ${mission.title}`}
        className="wla-section bg-[var(--color-background)]"
      >
        <div className="wla-container">
          <dl className="grid gap-[var(--space-xl)] border-y border-[var(--color-border)] py-[var(--space-xl)] md:grid-cols-2 md:gap-[var(--space-2xl)]">
            {mission.materials && (
              <Fact term="Materials">{mission.materials}</Fact>
            )}
            {/* Right-hand column as in the capture, with or without Materials. */}
            <Fact term="Leaves behind" className="md:col-start-2">
              {mission.leavesBehind}
            </Fact>
          </dl>

          <div className="flex flex-col gap-[var(--space-l)] pt-[var(--space-xl)] sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-baseline gap-[var(--space-sm)] font-[family-name:var(--font-serif)]">
              <span className="text-[length:var(--text-h3)]">
                {mission.title}
              </span>
              {priceLabel && (
                <span className="text-[length:var(--text-body)] text-[var(--color-text-muted)]">
                  {priceLabel}
                </span>
              )}
            </p>
            {/*
              The ONLY way into a purchase, and the same URL the Lovable site's
              "Get <mission>" must use (D-108): /purchase is behind sign-in
              (returning here after it, through email confirmation too), so
              the Checkout session is tied to an authenticated parent and a
              verified child. Never a Stripe Payment Link, which would take a
              payment no parent or child could be matched to.
            */}
            <ButtonLink
              href={`/purchase/${mission.slug}`}
              size="large"
              className="self-start sm:self-auto"
            >
              Get {mission.title}
              {priceLabel && <> — {priceLabel}</>}
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="wla-container flex flex-wrap gap-x-[var(--space-xl)] py-[var(--space-3xl)] md:py-[var(--space-4xl)]">
        <ArrowLink href="/missions">Explore Missions</ArrowLink>
        <ArrowLink href="/labs">Explore the 5 Labs</ArrowLink>
      </section>
    </main>
  );
}

/**
 * One term/description group. The <div> is the single wrapper HTML allows
 * between <dl> and a <dt>/<dd> pair, so any grid placement goes on it rather
 * than on a second wrapper (which would make the <dl> invalid).
 */
function Fact({
  term,
  children,
  className,
}: {
  term: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[length:var(--text-eyebrow)] font-medium uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-text-muted)]">
        {term}
      </dt>
      <dd className="mt-[var(--space-m)] text-[length:var(--text-body)] leading-[var(--leading-relaxed)]">
        {/* The site sets these lines as written, lower-case start and all. */}
        {children}
      </dd>
    </div>
  );
}
