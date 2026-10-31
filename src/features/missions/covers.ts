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
/**
 * What `missions.cover_image` may hold (D-146): a path the Academy serves itself
 * (`/missions/six-names.jpg`), or a file in the public `mission-covers` bucket
 * (`mission-covers/<mission id>/<name>.jpg`). Never a full address, so the same
 * row works in every environment: each app builds the address from its own
 * settings. The public website does the same (wla-main/src/lib/missions-shared.ts).
 */
export const COVER_BUCKET = "mission-covers";
const COVER_OBJECT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9-]{1,80}\\.(png|jpg|webp)";
const BUCKET_VALUE = new RegExp(`^${COVER_BUCKET}/${COVER_OBJECT}$`);
const LOCAL_VALUE = /^\/(?!\/)[A-Za-z0-9._/-]+$/;

export function isBucketCover(value: string | null | undefined): value is string {
  return typeof value === "string" && BUCKET_VALUE.test(value);
}

export function isStorableCover(value: string): boolean {
  return BUCKET_VALUE.test(value) || LOCAL_VALUE.test(value);
}

/** The bucket's object name for a stored value. */
export function coverObjectName(value: string): string {
  return value.slice(COVER_BUCKET.length + 1);
}

/** Is this object inside this mission's folder, named as an upload would be? */
export function isCoverObjectFor(missionId: string, objectName: string): boolean {
  return objectName.startsWith(`${missionId}/`) && BUCKET_VALUE.test(`${COVER_BUCKET}/${objectName}`);
}

/**
 * The address for a stored value, or null if it isn't one we can serve. Anything
 * else stays out of next/image, which throws on a host it doesn't allow.
 */
export function coverSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  if (LOCAL_VALUE.test(value)) return value;
  if (!isBucketCover(value)) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  return base ? `${base}/storage/v1/object/public/${value}` : null;
}

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
  const src = coverSrc(mission.cover_image);
  if (src) return { src, alt: supplied?.alt ?? "" };
  return supplied ?? null;
}
