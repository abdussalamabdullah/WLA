import "server-only";

/**
 * MISSION ANALYTICS — Tech Spec §42, PRD §32 (ANALYTICS-01).
 *
 * Deliberately three events and nothing more. Brief §53: "Avoid turning
 * children into an engagement-optimisation dataset."
 *
 * `mission_drop_off` is NOT emitted — see conflict C7. Drop-off is derived
 * (started, not completed within N days) and is computed from
 * `mission_progress`, not tracked as an event.
 *
 * No provider is wired: OPEN-09 has not selected one. This is the seam, not a
 * platform. Note what is absent from the payload — no child id, no name, no
 * response content (Tech Spec §42: "Avoid collecting unnecessary child
 * information in analytics"). `progressId` is an opaque internal key.
 */
export type MissionEvent = {
  name: "mission_started" | "mission_completed";
  missionId: string;
  progressId: string;
  screenKey?: string;
};

export async function recordEvent(event: MissionEvent): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    console.info("[analytics]", event.name, {
      missionId: event.missionId,
      screenKey: event.screenKey,
    });
  }
  // Wire a provider here once OPEN-09 is decided. Analytics must never throw
  // into a mission flow: losing an event is acceptable, losing progress is not.
}
