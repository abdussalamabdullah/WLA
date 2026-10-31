import { cookies } from "next/headers";
import { ButtonLink } from "@/components/ui/button";
import {
  ConfirmGiftEmailForm,
  RedeemGiftForm,
  RedeemWithCodeForm,
} from "@/components/commerce/redeem-forms";
import { listChildren } from "@/features/children/queries";
import { getEntitledChildIds } from "@/features/commerce/queries";
import { GIFT_CLAIM_COOKIE, GIFT_REDEEM_PATH } from "@/features/gifts/claim";
import { readClaimedGift } from "@/features/gifts/redeem";
import { looksLikeGiftToken } from "@/features/gifts/token";
import { createClient } from "@/lib/supabase/server";

// The token is a credential: it must not leave in a Referer header or be indexed.
export const metadata = {
  title: "Redeem a Gift",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/**
 * REDEEM A GIFT (D-140, D-145). The one redemption page, with two ways in:
 * the link in the gift email, or the website's "Redeem a Gift".
 *
 *   1. Prove the mailbox, which nothing is shown until: the link and the address
 *      together, or an address and the code emailed to it.
 *   2. Sign in or create an account: the same account flow as buying.
 *   3. Choose or add the child. The gift then becomes that child's entitlement.
 *
 * Nothing about a gift appears before step 2, and a wrong address learns
 * nothing about it.
 */
export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const claim = (await cookies()).get(GIFT_CLAIM_COOKIE)?.value;
  const gift = token ? null : await readClaimedGift(claim);

  return (
    <main className="wla-container">
      <div className="mx-auto w-full max-w-[34rem] py-[var(--space-2xl)]">
        {gift ? (
          <Claim missionId={gift.missionId} missionTitle={gift.missionTitle} />
        ) : !token ? (
          <>
            <h1 className="text-[length:var(--text-h1)]">Redeem a gift.</h1>
            <p className="wla-measure mt-[var(--space-m)] text-[var(--color-text-muted)]">
              Enter the email address this gift was sent to. We&rsquo;ll email it a code, and you
              can carry on here.
            </p>
            <div className="mt-[var(--space-xl)]">
              <RedeemWithCodeForm />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-[length:var(--text-h1)]">Confirm your email to access this gift.</h1>
            <p className="wla-measure mt-[var(--space-m)] text-[var(--color-text-muted)]">
              Enter the email address this gift was sent to, and you&rsquo;ll be able to access it.
            </p>
            <div className="mt-[var(--space-xl)]">
              <ConfirmGiftEmailForm token={looksLikeGiftToken(token) ? token : "invalid"} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

async function Claim({ missionId, missionTitle }: { missionId: string; missionTitle: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const here = encodeURIComponent(GIFT_REDEEM_PATH);

  return (
    <>
      <h1 className="text-[length:var(--text-h1)]">You&rsquo;ve been given {missionTitle}.</h1>
      {user ? (
        <div className="mt-[var(--space-xl)]">
          <RedeemGiftForm
            missionTitle={missionTitle}
            childProfiles={await listChildren()}
            alreadyOwnedBy={await getEntitledChildIds(missionId)}
          />
        </div>
      ) : (
        <>
          <p className="wla-measure mt-[var(--space-m)] text-[var(--color-text-muted)]">
            Missions belong to a child on a parent or guardian&rsquo;s account. Sign in or create an
            account, then choose who this mission is for.
          </p>
          <div className="mt-[var(--space-xl)] flex flex-wrap gap-[var(--space-m)]">
            <ButtonLink href={`/signup?next=${here}`}>Create an account</ButtonLink>
            <ButtonLink href={`/login?next=${here}`} variant="secondary">
              Sign in
            </ButtonLink>
          </div>
        </>
      )}
    </>
  );
}
