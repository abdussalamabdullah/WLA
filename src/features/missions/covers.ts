import type { MissionRow } from "@/types/database";

/**
 * Mission cover imagery.
 *
 * The public site's mission card is led by a photograph — warm, tactile,
 * shot on linen and wood in the brand's own palette. It is not decoration:
 * the image IS the card, since the site draws no border, fill or shadow
 * around one. A card without it is a different component. See
 * docs/DESIGN-LANGUAGE §6.
 *
 * `missions.cover_image` is the real mechanism and takes precedence. This map
 * is a BRIDGE for artwork handed over directly rather than seeded: the Six
 * Names image was supplied by the client on 2026-09-27 and works immediately
 * from here, where setting the column would need a write to staging that has
 * not been authorised.
 *
 * supabase/seed/six_names_cover.sql sets the column properly. Once it has been
 * applied, the entry below can be deleted with no other change.
 */
const SUPPLIED_COVER: Record<string, { src: string; alt: string }> = {
  "six-names": {
    src: "/missions/six-names.jpg",
    /*
     * Described, not captioned. A child using a screen reader should learn
     * what the mission feels like — the same thing a sighted child gets from
     * the photograph — without being told the answer the mission withholds.
     * The cards in the image are deliberately blank; saying so is part of the
     * mission, not a spoiler.
     */
    alt: "Six blank kraft cards laid out in a row on linen, with twine, a pencil and a brass clip",
  },
};

export type MissionCover = { src: string; alt: string };

export function resolveMissionCover(
  mission: Pick<MissionRow, "slug" | "title" | "cover_image">,
): MissionCover | null {
  if (mission.cover_image) {
    return { src: mission.cover_image, alt: "" };
  }
  return SUPPLIED_COVER[mission.slug] ?? null;
}
