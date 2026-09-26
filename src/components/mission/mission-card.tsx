import Link from "next/link";
import {
  MissionStatusBadge,
  STATUS_ACTION,
} from "@/components/mission/mission-status";
import { LAB_LABEL } from "@/features/missions/labs";
import { formatMissionMeta } from "@/lib/utils";
import type { MissionRow, MissionStatus } from "@/types/database";

/**
 * MISSION CARD — Architecture §4 (LOCKED), UI/UX §21–§23, §70.
 *
 * Shows: title, Lab, age range, approximate duration, status, primary action.
 *
 * UI/UX §70: the Academy card is about **status + action**, not marketing
 * description + discovery. That is what separates it from the public card.
 *
 * §22: completed missions "should not look disabled or archived" — so the
 * Complete variant gets no reduced opacity, only different wording.
 *
 * The whole card is a link, but the action text carries the affordance so the
 * card never depends on hover (§58).
 */
export function MissionCard({
  mission,
  status,
}: {
  mission: MissionRow;
  status: MissionStatus;
}) {
  return (
    <li>
      <Link
        href={`/academy/missions/${mission.slug}`}
        className="group block rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-l)] transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)]"
      >
        <MissionStatusBadge status={status} />

        <h3 className="mt-[var(--space-sm)] text-[length:var(--text-h3)]">
          {mission.title}
        </h3>

        <p className="mt-[var(--space-xs)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {LAB_LABEL[mission.lab]}
        </p>
        <p className="text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {formatMissionMeta(
            mission.min_age,
            mission.max_age,
            mission.duration,
          )}
        </p>

        {/* Charcoal, not olive — small text on cream (colour application rule) */}
        <p className="mt-[var(--space-m)] text-[length:var(--text-label)] font-medium underline decoration-[var(--color-border-strong)] underline-offset-4 group-hover:decoration-[var(--color-primary)]">
          {STATUS_ACTION[status]} →
        </p>
      </Link>
    </li>
  );
}
