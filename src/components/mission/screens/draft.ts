"use client";

import { useEffect, useState } from "react";
import type { MissionScreen } from "@/features/mission-engine/navigation";

/**
 * INTERRUPTION-PROOF INPUT (Plan §11: "preserve interaction state through
 * accidental interruption"; D-99, D-100).
 *
 * What the child has done on a screen but not yet submitted — a half-typed
 * answer, a partly set tracker, how far through a sort they are — survives an
 * accidental reload or a dropped connection. It is kept in this browser tab
 * only (sessionStorage), keyed by mission and screen, and cleared when the
 * screen is submitted. It is NEVER mission state: the run lives on the server
 * (Architecture §13), and nothing here is sent anywhere or read by the
 * server. Storage that is blocked or full simply means nothing is restored.
 *
 * The saved value is applied after hydration, so the server render and the
 * first client render agree.
 */
type Where = { missionSlug: string; screen: Pick<MissionScreen, "screenKey"> };

const keyFor = (w: Where, name: string) => `wla-draft:${w.missionSlug}:${w.screen.screenKey}:${name}`;

/** Read a saved draft now (for effects that must not overwrite it). */
export function readDraft<T>(w: Where, name: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(keyFor(w, name));
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function useDraft<T>(w: Where, name: string, initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] {
  const key = keyFor(w, name);
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let saved: T | undefined;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) saved = JSON.parse(raw) as T;
    } catch { /* storage unavailable */ }
    if (saved !== undefined) queueMicrotask(() => setValue(saved as T));
  }, [key]);
  const set = (v: T | ((prev: T) => T)) =>
    setValue((prev) => {
      const next = typeof v === "function" ? (v as (prev: T) => T)(prev) : v;
      try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  return [value, set];
}

export function writeDraft<T>(w: Where, name: string, value: T) {
  try { sessionStorage.setItem(keyFor(w, name), JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** Forget this screen's drafts — called when the screen is submitted. */
export function clearDrafts(w: Where) {
  try {
    const prefix = keyFor(w, "");
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(prefix)) sessionStorage.removeItem(k);
    }
  } catch { /* storage unavailable */ }
}
