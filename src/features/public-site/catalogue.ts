import type { WlaLab } from "@/types/database";

/**
 * TEMPORARY PUBLIC-SITE CATALOGUE — a stand-in for the Lovable site (D-109).
 *
 * The public site's mission listing is marketing content, not Academy data:
 * the headline, deck and "leaves behind" line below exist nowhere in the
 * database, and the Lovable site serves them as static copy. Copy is taken
 * from the approved Lovable captures (`WLA- Mission.jpg`, `WLA- Six names.jpg`)
 * and agrees with the Public Website Master §2–§3.
 *
 * An entry is NOT a mission. `slug` must name an existing mission row, and is
 * only ever used to build a link to `/purchase/<slug>`, which re-reads the row
 * and refuses anything unpublished. Nothing here grants, prices or unlocks.
 *
 * Price and duration are deliberately absent: both are mission data (D-09),
 * read from the row by `getPublicMissionFacts` and shown only when the row is
 * publicly readable. Where the captures show a placeholder (`[price]`,
 * `[duration]`, `[final concise preparation line]`) nothing is invented.
 *
 * Mars Bridge Builder appears in the captures but has no mission record, so it
 * is not listed: a card whose "See Mission" leads nowhere would be worse than
 * none. Adding it later is one entry here once its mission exists.
 */
export type PublicMissionEntry = {
  slug: string;
  title: string;
  lab: WlaLab;
  minAge: number;
  maxAge: number;
  /** The delivery mechanism as the site prints it ("Hybrid"). */
  delivery: string;
  /** Serif line under the title — the core description's first sentence. */
  headline: string;
  /** The rest of the core description, reused verbatim on the detail page. */
  deck: string;
  /** Master §3: "only if useful to the buying decision". Null = not yet final. */
  materials: string | null;
  leavesBehind: string;
};

export const PUBLIC_MISSIONS: readonly PublicMissionEntry[] = [
  {
    slug: "six-names",
    title: "Six Names",
    lab: "decision",
    minAge: 11,
    maxAge: 15,
    delivery: "Hybrid",
    headline:
      "Six names appear on a list, but what the list means is not clear.",
    deck: "Make a choice with what you know, see what follows, then decide whether new information changes your judgement.",
    // The captures and the Master both show "[final concise preparation line]".
    materials: null,
    leavesBehind:
      "a decision trail showing how the child’s judgement changed as the situation unfolded.",
  },
];

export function findPublicMission(slug: string): PublicMissionEntry | null {
  return PUBLIC_MISSIONS.find((m) => m.slug === slug) ?? null;
}
