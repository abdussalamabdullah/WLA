import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a mission price.
 *
 * Currency and amount BOTH come from the mission's commercial data — never
 * hard-coded here or in any component (client instruction, 2026-09-25).
 * GBP is the launch currency (D-04) but is a data value, not an assumption.
 */
export function formatPrice(
  amountInMinorUnits: number,
  currency: string,
  locale = "en-GB",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountInMinorUnits / 100);
}

/** "Ages 7–11 · 60–90 mins" — the metadata line locked by Architecture §4. */
/**
 * Mission metadata as SEPARATE parts, for <MetaList>.
 *
 * The site sets its meta with air around each middot, so the separator has to
 * be rendered rather than baked into a joined string. formatMissionMeta below
 * still returns the joined form for the places that need plain text.
 */
export function missionMetaParts(
  minAge: number,
  maxAge: number,
  duration: string | null,
): string[] {
  const parts = [`Ages ${minAge}\u2013${maxAge}`];
  if (duration) parts.push(duration);
  return parts;
}

export function formatMissionMeta(
  minAge: number,
  maxAge: number,
  duration: string | null,
): string {
  const parts = [`Ages ${minAge}–${maxAge}`];
  if (duration) parts.push(duration);
  return parts.join(" · ");
}
