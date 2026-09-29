import { LabIcon } from "@/components/mission/lab-icon";
import { LAB_LABEL, LAB_TAGLINE } from "@/features/missions/labs";
import { MissionStatusBadge } from "@/components/mission/mission-status";
import { MetaList } from "@/components/ui/section";
import { missionMetaParts } from "@/lib/utils";
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
      {/*
        The Build Brief's ENTRY section lists exactly what Mission Home shows:
        the title, the Lab, its tagline, the age range, the mission time and
        the delivery type. Delivery was missing and is a fact already on the
        mission row; the tagline belongs to the Lab (see LAB_TAGLINE).
      */}
      <MetaList
        className="mt-[var(--space-s)]"
        leading={<LabIcon lab={mission.lab} />}
        items={[
          LAB_LABEL[mission.lab],
          ...missionMetaParts(
            mission.min_age,
            mission.max_age,
            mission.duration,
          ),
          capitalise(mission.delivery_type),
        ]}
      />

      {LAB_TAGLINE[mission.lab] && (
        <p className="wla-editorial mt-[var(--space-m)] text-[length:var(--text-h3)]">
          {LAB_TAGLINE[mission.lab]}
        </p>
      )}
      {/*
        The mission's own sentence, in KARLA.

        It was set in Fraunces to echo the public site's hook line, but this is
        a paragraph of explanation rather than an editorial statement, and the
        serif made it compete with the title directly above it. Karla keeps the
        Lab tagline above as the one display-voice line on the screen.
      */}
      {mission.description && (
        <p className="wla-measure mt-[var(--space-l)] text-[length:var(--text-body-lg)] leading-[var(--leading-normal)]">
          {mission.description}
        </p>
      )}
    </div>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
