import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
 * D-90 — every analytics event the engine can emit must be on the database's
 * allow-lists. engine_save now drops a refused event instead of failing the
 * child's save (0033), so a mismatch no longer breaks a mission — but it
 * would silently lose reporting. This keeps the two in step.
 */

const repo = join(__dirname, "../../../..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "__tests__" ? [] : files(p);
    return /\.tsx?$/.test(f) ? [p] : [];
  });

function latestAllowList(constraint: string): Set<string> {
  const dir = join(repo, "supabase/migrations");
  const sql = readdirSync(dir).sort().map((f) => readFileSync(join(dir, f), "utf8"));
  const defs = sql.flatMap((s) => [...s.matchAll(new RegExp(`add constraint ${constraint} check \\(([\\s\\S]*?)\\n?\\);`, "g"))].map((m) => m[1]));
  const last = defs[defs.length - 1] ?? "";
  return new Set([...last.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((x) => x !== "jsonb"));
}

describe("analytics the engine emits are allowed by the database", () => {
  const src = [...files(join(repo, "src/features/mission-engine")), join(repo, "src/components/mission/mission-context.tsx")]
    .map((f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 "))
    .join("\n");

  it("every event name", () => {
    const allowed = latestAllowList("analytics_events_name_check");
    expect(allowed.size).toBeGreaterThan(10);
    const emitted = new Set([...src.matchAll(/\bname:\s*"([a-z_]+)"/g)].map((m) => m[1]));
    // `report(...)` names from shared components
    for (const m of src.matchAll(/"(mission_control_opened|kit_opened|device_fallback_used)"/g)) emitted.add(m[1]);
    const missing = [...emitted].filter((n) => !allowed.has(n));
    expect(missing).toEqual([]);
  });

  it("every detail key", () => {
    const allowed = latestAllowList("analytics_events_detail_keys_check");
    expect(allowed.size).toBeGreaterThan(5);
    const keys = new Set<string>();
    for (const m of src.matchAll(/detail:\s*\{([^{}]*)\}/g)) {
      for (const k of m[1].matchAll(/(?:^|[,{\s])([a-z_]+)\s*:/g)) keys.add(k[1]);
    }
    const missing = [...keys].filter((k) => !allowed.has(k));
    expect(missing).toEqual([]);
  });
});
