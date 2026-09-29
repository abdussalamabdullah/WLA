import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logWarn } from "@/lib/observability/logger";

/**
 * MISSION ANALYTICS — Tech Spec §42, PRD §32 (ANALYTICS-01).
 *
 * Two events and nothing more. Brief §53: "Avoid turning children into an
 * engagement-optimisation dataset."
 *
 * `mission_drop_off` is NOT emitted — see conflict C7. Drop-off is not
 * something a child does; it is the absence of something. It is derived from
 * `mission_progress` by `admin_mission_stats()`.
 *
 * WHAT IS SENT AND WHAT IS DROPPED
 *
 * Callers pass a `childId` and a `progressId`. The child id is an
 * AUTHORISATION input — the database function re-establishes parent → child →
 * entitlement → run with it, then discards it. The progress id never leaves
 * this function at all. What is stored is the mission, the pinned version and
 * a timestamp, which answers "how many started, how many finished" without
 * being joinable to a child.
 *
 * NEVER THROWS INTO A MISSION FLOW. Losing an event is acceptable; losing
 * progress is not. A failed write is logged and swallowed.
 */
export type MissionEvent = {
  name: "mission_started" | "mission_completed";
  /** Authorisation input only. Never stored. */
  childId: string;
  missionId: string;
  /** Accepted for call-site clarity; deliberately not sent anywhere. */
  progressId: string;
  screenKey?: string;
};

export async function recordEvent(event: MissionEvent): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("record_mission_event", {
      p_child_id: event.childId,
      p_mission_id: event.missionId,
      p_name: event.name,
    });
    if (error) {
      logWarn("analytics_write_failed", {
        name: event.name,
        missionId: event.missionId,
        reason: error.message,
      });
    }
  } catch (error) {
    // Analytics must never become a reason a mission fails to start or finish.
    logWarn("analytics_threw", {
      name: event.name,
      missionId: event.missionId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}
