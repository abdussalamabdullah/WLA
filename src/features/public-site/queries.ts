import "server-only";

import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils";

export type PublicMissionFacts = {
  duration: string | null;
  /** Formatted from the row's own currency; null for a free or unpriced row. */
  priceLabel: string | null;
};

/**
 * The commercial facts a public mission page may show, from the mission row.
 *
 * Read with the visitor's own client, so RLS decides — and `published` is
 * asked for explicitly as well, so an admin browsing the page sees what a
 * visitor sees. An unpublished mission yields null and the page shows no
 * price or duration rather than an invented one (D-09, D-109).
 *
 * Display only. The amount charged is read again server-side when the
 * Checkout session is created; nothing here reaches the purchase.
 */
export async function getPublicMissionFacts(
  slug: string,
): Promise<PublicMissionFacts | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("missions")
    .select("duration, price_minor, currency, is_free")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!data) return null;

  return {
    duration: data.duration,
    priceLabel:
      !data.is_free && data.price_minor
        ? formatPrice(data.price_minor, data.currency)
        : null,
  };
}
