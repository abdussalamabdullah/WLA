import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildModel, type MissionModel } from "./definition";
import { parseMissionState, type MissionStateData } from "./schemas";
import { mergeFromStorage, splitForStorage } from "./variables";
import type { AnalyticsDraft } from "./contract";
import type { EvidenceDraft } from "./runtime";
import type { MissionScreen } from "./navigation";
import type { ResolvedAsset } from "./media";
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
  /** This run's own responses by screen key, for recall (F6). */
  responses: Record<string, unknown>;
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
    responses?: Record<string, unknown>;
  };
  const model = buildModel({ definition: d.definition, screens: d.screens, completionRule: d.completion_rule });
  return {
    progress: d.progress,
    model,
    state: mergeFromStorage(parseMissionState(d.state), d.private),
    responses: d.responses ?? {},
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

/**
 * F7 — sign the media the CURRENT projected screen needs, at the run's
 * pinned version. The caller has authorised the run and passes keys taken
 * from the projection, never from the browser; this signs only those keys,
 * only for that mission and version, for one hour.
 */
export async function signMedia(missionId: string, version: number, keys: string[]): Promise<Map<string, ResolvedAsset>> {
  const out = new Map<string, ResolvedAsset>();
  if (!keys.length) return out;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mission_assets")
    .select("key, kind, storage_path, alt_text, long_description, transcript, captions_path")
    .eq("mission_id", missionId)
    .eq("version", version)
    .in("key", keys);
  if (error || !data?.length) return out;
  const paths = [...new Set(data.flatMap((a) => [a.storage_path, a.captions_path].filter((p): p is string => Boolean(p))))];
  const { data: signed } = await admin.storage.from("mission-media").createSignedUrls(paths, 60 * 60);
  const url = new Map((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl]));
  for (const a of data) {
    const u = url.get(a.storage_path);
    if (!u) continue;
    out.set(a.key, {
      key: a.key,
      kind: a.kind,
      url: u,
      alt: a.alt_text,
      longDescription: a.long_description,
      transcript: a.transcript,
      captionsUrl: a.captions_path ? (url.get(a.captions_path) ?? null) : null,
    });
  }
  return out;
}
