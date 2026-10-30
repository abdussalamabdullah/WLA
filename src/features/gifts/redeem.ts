import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hashGiftToken, looksLikeGiftToken, newGiftToken, normaliseGiftEmail } from "./token";

/**
 * Reading a gift by its token, for the redemption page.
 *
 * Service role, because no client role can read `mission_gifts`. It acts only
 * on a secret the caller presented (D-64 pattern: the secret authorises, this
 * reads), and returns only what that holder may see. Nothing here takes an id.
 */
export type EmailCheck =
  | { outcome: "matched"; claim: string }
  | { outcome: "mismatch" }
  | { outcome: "invalid" }
  | { outcome: "already_redeemed" };

/** Throws if the database can't answer, which is not the same as a wrong address. */
export async function confirmGiftEmail(token: string, email: string): Promise<EmailCheck> {
  if (!looksLikeGiftToken(token)) return { outcome: "invalid" };
  const { token: claim, hash: claimHash } = newGiftToken();
  const { data, error } = await createAdminClient().rpc("confirm_gift_email", {
    p_token_hash: hashGiftToken(token),
    p_email: normaliseGiftEmail(email),
    p_claim_hash: claimHash,
  });
  if (error) throw error;
  if (data === "matched") return { outcome: "matched", claim };
  if (data === "mismatch") return { outcome: "mismatch" };
  if (data === "already_redeemed") return { outcome: "already_redeemed" };
  return { outcome: "invalid" };
}

export type ClaimedGift = { missionId: string; missionTitle: string; missionSlug: string };

/** The gift a confirmed claim refers to, or null if it is no longer redeemable. */
export async function readClaimedGift(claim: string | undefined): Promise<ClaimedGift | null> {
  if (!looksLikeGiftToken(claim)) return null;
  const { data } = await createAdminClient()
    .from("mission_gifts")
    .select("mission_id, status, missions(title, slug)")
    .eq("claim_hash", hashGiftToken(claim))
    .maybeSingle();
  if (!data || data.status !== "paid") return null;
  const mission = data.missions as unknown as { title: string; slug: string } | null;
  if (!mission) return null;
  return { missionId: data.mission_id, missionTitle: mission.title, missionSlug: mission.slug };
}
