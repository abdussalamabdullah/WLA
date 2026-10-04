import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildModel, type MissionModel } from "./definition";
import { parseMissionState, type MissionStateData } from "./schemas";
import { mergeFromStorage, splitForStorage } from "./variables";
import type { AnalyticsDraft } from "./contract";
import type { EvidenceDraft } from "./runtime";
import type { MissionScreen } from "./navigation";
import type { Json, MissionProgressRow } from "@/types/database";

/**
 * THE ENGINE STORE — the only code that reads or writes mission state (D-80).
 *
 * Uses the service-role client, against functions executable by service_role
 * only (`engine_load_run`, `engine_save`, `engine_record_events`). This is the
 * fourth narrow use of lib/supabase/admin.ts recorded in CLAUDE.md, and it has
 * the same shape as D-64: the CALLER has already authorised the run — the
 * parent permission chain (requireEntitledMission) or the token-derived child
 * lookup (child_session_mission) — and passes a progress id it obtained from
 * that authorised read, never one from the browser. The store decides nothing;
 * it loads and saves what the runtime computed.
 */

export type LoadedRun = {
  progress: MissionProgressRow;
  model: MissionModel;
  /** Full state, hidden variables included. Never sent to a client as-is. */
  state: MissionStateData;
};

export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreError";
  }
}

export async function loadRun(progressId: string): Promise<LoadedRun> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("engine_load_run", { p_progress_id: progressId });
  if (error) throw new StoreError(`load failed: ${error.message}`);
  if (!data) throw new StoreError("run not found");
  const d = data as unknown as {
    progress: MissionProgressRow;
    state: unknown;
    private: unknown;
    definition: unknown;
    completion_rule: unknown;
    screens: MissionScreen[];
  };
  const model = buildModel({ definition: d.definition, screens: d.screens, completionRule: d.completion_rule });
  return {
    progress: d.progress,
    model,
    state: mergeFromStorage(parseMissionState(d.state), d.private),
  };
}

export async function saveRun(args: {
  progressId: string;
  model: MissionModel;
  state: MissionStateData;
  screenKey: string | null;
  response: { key: string; value: Json } | null;
  complete: boolean;
  evidence: EvidenceDraft[];
  events: AnalyticsDraft[];
}): Promise<MissionProgressRow | null> {
  const { publicState, privateData } = splitForStorage(args.state, args.model.definition.variables);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("engine_save", {
    p_progress_id: args.progressId,
    p_state: publicState as unknown as Json,
    p_private: privateData as unknown as Json,
    p_screen_key: args.screenKey,
    p_response_key: args.response?.key ?? null,
    p_response_value: (args.response?.value ?? null) as Json,
    p_complete: args.complete,
    p_evidence: args.evidence as unknown as Json,
    p_events: args.events as unknown as Json,
  });
  if (error) return null;
  return data as unknown as MissionProgressRow;
}

/** Analytics that happen outside an interaction. Never a reason for a failure (D-50). */
export async function recordRunEvents(progressId: string, events: AnalyticsDraft[]): Promise<void> {
  if (!events.length) return;
  try {
    await createAdminClient().rpc("engine_record_events", {
      p_progress_id: progressId,
      p_events: events as unknown as Json,
    });
  } catch {
    // Reporting must never break a mission.
  }
}
