import type { MissionModel } from "@/features/mission-engine/definition";
import { commonOf } from "@/features/mission-engine/definition";

/**
 * PRINT-RESOURCE CHECKLIST (Plan §12). For each Mission Kit resource of a
 * draft: is it printable, and what in the mission depends on it — screens
 * that require it, Mission Control pointing at it, Kit QR codes opening it,
 * printables built on it. Plus what the mission names that the Kit lacks.
 * Pure: the builder page supplies the draft's model and Kit rows.
 */
export type ChecklistRow = { title: string; type: string; canPrint: boolean; usedBy: string[]; notes: string[] };

export function printChecklist(model: MissionModel, resources: { title: string; type: string; can_print: boolean }[]) {
  const uses = new Map<string, string[]>();
  const add = (title: string, use: string) => uses.set(title, [...(uses.get(title) ?? []), use]);
  for (const s of model.screens) {
    const cfg = (s.configuration ?? {}) as { requiredResourceIds?: string[] };
    for (const t of cfg.requiredResourceIds ?? []) add(t, `needed on "${s.title || s.screenKey}"`);
    for (const item of commonOf(s).support ?? []) if (item.kind === "materials" && item.resource) add(item.resource, `Mission Control on "${s.title || s.screenKey}"`);
  }
  for (const q of model.definition.qr) if (q.action === "resource" && q.resource) add(q.resource, `QR code "${q.label}"`);
  for (const p of model.definition.prints) add(p.base, `base of printable "${p.title}"`);

  const rows: ChecklistRow[] = resources.map((r) => {
    const usedBy = uses.get(r.title) ?? [];
    const notes: string[] = [];
    if (!r.can_print && usedBy.some((u) => u.startsWith("base of printable"))) notes.push("A printable is built on it but it is not marked printable.");
    if (r.type !== "pdf" && usedBy.some((u) => u.startsWith("base of printable"))) notes.push("Printables need a PDF base.");
    if (!usedBy.length) notes.push("Nothing in the mission points at it — fine for a general Kit item.");
    return { title: r.title, type: r.type, canPrint: r.can_print, usedBy, notes };
  });
  const missing = [...uses.keys()].filter((t) => !resources.some((r) => r.title === t)).map((t) => ({ title: t, usedBy: uses.get(t)! }));
  return { rows, missing };
}
