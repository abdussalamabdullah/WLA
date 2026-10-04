"use client";

import { createContext, useContext } from "react";

/**
 * What shared mission components may know about the mission they are in.
 *
 * Provided by MissionRunner (a learner: `report` posts allow-listed analytics
 * through recordMissionEventAction) and by Learner Preview (an admin: `report`
 * does nothing — Preview never creates learner analytics). Components never
 * call analytics themselves; they call `report` and the provider decides.
 */
export type SupportItem = {
  title: string;
  body: string;
  level?: number;
  kind?: "nudge" | "check" | "materials" | "reword" | "recovery";
  resource?: string;
};

export type MissionContextValue = {
  missionSlug: string;
  mode: "learner" | "preview";
  /** Mission Control v2 items for the current screen (projected). */
  support: SupportItem[];
  report: (name: "mission_control_opened" | "kit_opened" | "device_fallback_used", detail?: { level?: number; source?: string }) => void;
};

const MissionContext = createContext<MissionContextValue>({
  missionSlug: "",
  mode: "preview",
  support: [],
  report: () => {},
});

export const MissionContextProvider = MissionContext.Provider;
export const useMissionContext = () => useContext(MissionContext);
