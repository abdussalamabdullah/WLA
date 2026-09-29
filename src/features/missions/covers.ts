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
  const supplied = SUPPLIED_COVER[mission.slug];

  /*
   * The column wins for WHICH image; the description is looked up separately.
   *
   * Found in staging QA: once `cover_image` was seeded, this returned
   * `alt: ""` and the photograph lost its description — the same image was
   * described for a screen-reader user locally and silent on staging. The
   * column holds a path, not a description, so there is nothing in it to
   * describe the image with; the written one lives here and should be used
   * whichever path supplied the src.
   *
   * A mission with a cover_image and no entry here still yields `alt: ""`,
   * which is correct rather than lazy: an undescribed decorative image is
   * better than an invented description, and the title always sits beside it.
   */
  if (mission.cover_image) {
    return { src: mission.cover_image, alt: supplied?.alt ?? "" };
  }
  return supplied ?? null;
}
