import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseForm } from "@/components/commerce/purchase-form";
import { FormNotice } from "@/components/ui/field";
import { listChildren } from "@/features/children/queries";
import {
  getEntitledChildIds,
  getPurchasableMission,
} from "@/features/commerce/queries";
import { LAB_LABEL } from "@/features/missions/labs";
import { formatMissionMeta, formatPrice } from "@/lib/utils";

export const metadata = { title: "Get this mission" };

/**
 * Purchase — the bridge between the public Mission Detail page and Checkout.
 *
 * Protected by middleware: buying requires an account, because an entitlement
 * must attach to a child profile (Architecture §3).
 *
 * The price shown here is read from the mission row and rendered with the
 * mission's own currency (D-09). It is display only — the amount actually
 * charged is read again server-side when the session is created.
 */
export default async function PurchasePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { slug } = await params;
  const { cancelled } = await searchParams;

  const mission = await getPurchasableMission(slug);
  if (!mission) notFound();

  const [childProfiles, alreadyOwnedBy] = await Promise.all([
    listChildren(),
    getEntitledChildIds(mission.id),
  ]);

  return (
    <main className="wla-container">
      <div className="mx-auto w-full max-w-[34rem] py-[var(--space-2xl)]">
        <Link
          href={`/missions/${mission.slug}`}
          className="text-[length:var(--text-label)] underline decoration-[var(--color-border-strong)] underline-offset-4"
        >
          ← Back to {mission.title}
        </Link>

        <h1 className="mt-[var(--space-m)] text-[length:var(--text-h1)]">
          {mission.title}
        </h1>
        <p className="mt-[var(--space-s)] text-[var(--color-text-muted)]">
          {LAB_LABEL[mission.lab]} ·{" "}
          {formatMissionMeta(
            mission.min_age,
            mission.max_age,
            mission.duration,
          )}
        </p>

        {cancelled && (
          <div className="mt-[var(--space-l)]">
            <FormNotice message="Payment cancelled. Nothing has been charged." />
          </div>
        )}

        <div className="mt-[var(--space-xl)]">
          <PurchaseForm
            missionSlug={mission.slug}
            missionTitle={mission.title}
            priceLabel={
              mission.price_minor
                ? formatPrice(mission.price_minor, mission.currency)
                : "—"
            }
            isFree={mission.is_free}
            childProfiles={childProfiles}
            alreadyOwnedBy={alreadyOwnedBy}
          />
        </div>
      </div>
    </main>
  );
}
