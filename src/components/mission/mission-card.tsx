import Link from "next/link";
import {
  MissionStatusBadge,
  STATUS_ACTION,
} from "@/components/mission/mission-status";
import { LAB_LABEL } from "@/features/missions/labs";
import { formatMissionMeta, cn } from "@/lib/utils";
import type { MissionRow, MissionStatus } from "@/types/database";

/**
 * MISSION CARD — Architecture §4 (LOCKED), UI/UX §21–§23, §70.
 *
 * Shows title, Lab, age range, duration, delivery type, status and the one
 * action that matches that status. §70: the Academy card is about
 * **status + action**, not marketing description — that is what separates it
 * from the public card.
 *
 * THE SURFACE ENCODES STATE.
 *
 * My Missions exists to answer three questions (Architecture §4): what do I
 * have, what was I doing, where do I continue. Three identical cards
 * differing only in badge text answer the first and leave the other two to be
 * read. So the in-progress card sits on sage while the others stay on cream —
 * the one place UI/UX §7's "occasional Sage surfaces" earns its keep, because
 * it makes "where do I continue" answerable at a glance.
 *
 * Status is never carried by surface ALONE (Architecture §20): the badge text,
 * the marker and the action wording all still say it.
 *
 * §22: a completed mission "should not look disabled or archived" — it keeps
 * full contrast and a normal action, and is distinguished only by a quieter
 * border.
 *
 * NOT IMPLEMENTED: §21 also lists a mission image. `missions.cover_image` is
 * null for every seeded mission and no imagery has been supplied, so there is
 * nothing to render. Rendering it well would also need next/image remote
 * patterns for the Storage domain. Left out rather than shipped as an
 * unexercised path — tracked as an outstanding content dependency alongside
 * the Child Mission PDF (OPEN-13).
 */
const SURFACE: Record<MissionStatus, string> = {
  not_started: "border-[var(--color-border-strong)] bg-[var(--color-surface)]",
  in_progress: "border-[var(--color-primary)] bg-[var(--color-surface-sage)]",
  complete: "border-[var(--color-border)] bg-[var(--color-surface)]",
};

export function MissionCard({
  mission,
  status,
}: {
  mission: MissionRow;
  status: MissionStatus;
}) {
  /* §21 lists delivery type "where relevant"; it joins the existing
     dot-separated meta rather than becoming another line. */
  const meta = [
    LAB_LABEL[mission.lab],
    formatMissionMeta(mission.min_age, mission.max_age, mission.duration),
    mission.delivery_type === "digital" ? null : capitalise(mission.delivery_type),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <Link
        href={`/academy/missions/${mission.slug}`}
        className={cn(
          "group flex h-full flex-col rounded-[var(--radius-card)] border",
          "transition-colors duration-[var(--duration-fast)]",
          "hover:border-[var(--color-primary)]",
          SURFACE[status],
        )}
      >
        <div className="flex flex-1 flex-col p-[var(--space-l)]">
          <MissionStatusBadge status={status} />

          <h3 className="mt-[var(--space-sm)] text-[length:var(--text-h2)]">
            {mission.title}
          </h3>

          <p className="mt-[var(--space-xs)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
            {meta}
          </p>

          {/* Pushed to the bottom so the action sits on one line across a row
              of cards whose titles wrap differently. */}
          <p className="mt-auto pt-[var(--space-l)] text-[length:var(--text-label)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4 group-hover:decoration-[var(--color-primary)]">
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
