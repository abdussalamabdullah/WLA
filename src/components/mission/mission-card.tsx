import Image from "next/image";
import Link from "next/link";
import { LabIcon } from "@/components/mission/lab-icon";
import {
  MissionStatusBadge,
  STATUS_ACTION,
} from "@/components/mission/mission-status";
import { MetaList } from "@/components/ui/section";
import { resolveMissionCover } from "@/features/missions/covers";
import { LAB_LABEL } from "@/features/missions/labs";
import { missionMetaParts, cn } from "@/lib/utils";
import type { MissionRow, MissionStatus } from "@/types/database";

/**
 * MISSION CARD — Architecture §4 (LOCKED), UI/UX §21–§23, §70.
 *
 * THE PHOTOGRAPH IS THE CARD.
 *
 * Measured from the public site: a mission is a photograph at a 6px radius,
 * then the title in Fraunces at 22px, then a Lab glyph and dot-separated
 * meta, then a serif hook line, then two lines of description. There is no
 * border, no fill, no padding box and no shadow anywhere near it. See
 * docs/DESIGN-LANGUAGE §6.
 *
 * The Academy previously drew a bordered, filled, padded box and encoded
 * status in its surface — the in-progress card sat on sage. That device is
 * gone with the box, so status is now carried by the badge (text + marker)
 * and by the action wording, which is what Architecture §20 requires anyway:
 * never colour alone. What the surface added was a fourth carrier of a fact
 * already stated three times, at the cost of the card not looking like WLA.
 *
 * §70 still holds — the Academy card is about status + action, not marketing
 * description — so the site's hook line is not reproduced here. The public
 * card sells the mission; this one resumes it.
 *
 * §22: a completed mission "should not look disabled or archived". It keeps
 * full contrast and a normal action.
 */
export function MissionCard({
  mission,
  status,
}: {
  mission: MissionRow;
  status: MissionStatus;
}) {
  const cover = resolveMissionCover(mission);

  /* §21 lists delivery type "where relevant"; it joins the dot-separated meta
     rather than becoming another line. */
  const meta = [
    LAB_LABEL[mission.lab],
    ...missionMetaParts(mission.min_age, mission.max_age, mission.duration),
    mission.delivery_type === "digital"
      ? null
      : capitalise(mission.delivery_type),
  ];

  return (
    <li>
      <Link
        href={`/academy/missions/${mission.slug}`}
        className="group flex flex-col"
      >
        {/*
          No artwork, no substitute. An earlier pass held the grid's
          proportions with a tinted panel at the image's aspect ratio; next to
          a real photograph it was louder than the photograph, which is what a
          placeholder that size always becomes. A mission without a cover is
          simply title-led until its artwork exists.
        */}
        {cover && (
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-surface)] bg-[var(--color-surface-sage)]">
            <Image
              src={cover.src}
              alt={cover.alt}
              fill
              sizes="(min-width: 1024px) 362px, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        )}

        <div
          className={cn("flex flex-1 flex-col", cover && "mt-[var(--space-m)]")}
        >
          <MissionStatusBadge status={status} />

          {/* h2, not h3: a card is a section of My Missions, whose h1 is the
              page title. h1 → h3 skips a level (WCAG 1.3.1). */}
          <h2
            className={cn(
              "mt-[var(--space-s)] text-[length:var(--text-h3)]",
              "underline decoration-transparent underline-offset-4 transition-colors",
              "duration-[var(--duration-fast)] group-hover:decoration-[var(--color-primary)]",
            )}
          >
            {mission.title}
          </h2>

          <MetaList
            className="mt-[var(--space-xs)]"
            leading={<LabIcon lab={mission.lab} />}
            items={meta}
          />

          {/*
            Packed to the content, not stretched to the row.
            The action used to be pushed down with `mt-auto` so it sat on one
            line across a row of cards. In a row where one mission has its
            photograph and another does not yet, that opened a void the height
            of the image under the shorter card. Cards are compact instead:
            uneven action baselines read as an editorial grid, a void reads as
            a bug — and the public site does not align these either.
          */}
          <p className="pt-[var(--space-m)] text-[length:var(--text-label)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4 group-hover:decoration-[var(--color-primary)]">
            {STATUS_ACTION[status]} →
          </p>
        </div>
      </Link>
    </li>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
