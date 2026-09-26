import { LAB_LABEL } from "@/features/missions/labs";
import { MissionStatusBadge } from "@/components/mission/mission-status";
import { formatMissionMeta } from "@/lib/utils";
import type { MissionRow, MissionStatus } from "@/types/database";

/**
 * MISSION IDENTITY — UI/UX §25, step 1 of the locked Mission Home hierarchy.
 * Answers "what mission is this?" before anything asks the child to act.
 */
export function MissionIdentity({
  mission,
  status,
}: {
  mission: MissionRow;
  status: MissionStatus;
}) {
  return (
    <div>
      <MissionStatusBadge status={status} />
      <h1 className="mt-[var(--space-sm)] text-[length:var(--text-h1)]">
        {mission.title}
      </h1>
      <p className="mt-[var(--space-s)] text-[var(--color-text-muted)]">
        {LAB_LABEL[mission.lab]} ·{" "}
        {formatMissionMeta(mission.min_age, mission.max_age, mission.duration)}
      </p>
      {mission.description && (
        <p className="wla-measure mt-[var(--space-m)] text-[length:var(--text-body-lg)]">
          {mission.description}
        </p>
      )}
    </div>
  );
}
