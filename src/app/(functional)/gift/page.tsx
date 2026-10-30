import { ArrowLink } from "@/components/public-site/public-site";
import { FormNotice } from "@/components/ui/field";
import { PUBLIC_MISSIONS } from "@/features/public-site/catalogue";
import { getPublicMissionFacts } from "@/features/public-site/queries";

export const metadata = { title: "Buy a Gift" };

/**
 * BUY A GIFT (D-140). Choosing what to give; everything else happens on the
 * ordinary purchase page, with its gift toggle already on. There is no second
 * checkout here.
 */
export default async function GiftPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string }>;
}) {
  const { purchase } = await searchParams;
  const facts = await Promise.all(
    PUBLIC_MISSIONS.map(async (m) => ({ mission: m, facts: await getPublicMissionFacts(m.slug) })),
  );
  // A priced, published mission: a free one needs no gift, and an unpublished one can't be bought.
  const giftable = facts.filter((f) => f.facts?.priceLabel);

  return (
    <main className="wla-container">
      <div className="mx-auto w-full max-w-[34rem] py-[var(--space-2xl)]">
        <h1 className="text-[length:var(--text-h1)]">Buy a Gift</h1>
        {purchase === "success" ? (
          <div className="mt-[var(--space-l)]">
            <FormNotice message="Thank you. Once your payment is confirmed, we'll email the recipient a link to redeem the mission." />
          </div>
        ) : (
          <p className="wla-measure mt-[var(--space-m)] text-[var(--color-text-muted)]">
            Choose a mission to give. You&rsquo;ll enter the recipient&rsquo;s email address next, and
            they&rsquo;ll redeem it for their child.
          </p>
        )}
        {giftable.length === 0 ? (
          <p className="mt-[var(--space-xl)] text-[var(--color-text-muted)]">
            No missions are available to give right now.
          </p>
        ) : (
          <ul className="mt-[var(--space-xl)] flex flex-col gap-[var(--space-m)]">
            {giftable.map(({ mission, facts: f }) => (
              <li key={mission.slug}>
                <ArrowLink href={`/purchase/${mission.slug}?gift=1`}>
                  {mission.title} — {f?.priceLabel}
                </ArrowLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
