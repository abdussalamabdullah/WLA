import "server-only";

import { requireAdmin } from "@/lib/permissions";
import type { MissionModel } from "@/features/mission-engine/definition";
import { startRun } from "@/features/mission-engine/runtime";
import { emptyMissionState } from "@/features/mission-engine/schemas";
import type { Issue } from "@/features/mission-engine/validator";

/**
 * PRINT-OUTPUT QA (Plan §5 "retain approved WLA presentation and print
 * standards", D-101). Renders every printable of a draft, once for every
 * approved variant (and once without one when there are none), against the
 * real base PDF and images, and reports what would come out wrong: text that
 * will not fit even at 8pt, anything off its page, a missing page or image,
 * or a run that would print no pages. Blocking, so a broken print cannot be
 * published. Draft files are read with the admin's own session (D-61, D-63).
 */
export async function printQa(
  model: MissionModel,
  resources: { title: string; storage_path: string }[],
  media: { key: string; storage_path: string }[],
): Promise<Issue[]> {
  if (!model.definition.prints.length) return [];
  const { renderPrint } = await import("@/features/mission-engine/print");
  const { supabase } = await requireAdmin();
  const issues: Issue[] = [];

  const download = async (bucket: string, p: string) => {
    const { data } = await supabase.storage.from(bucket).download(p);
    return data ? { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type } : null;
  };

  const variants = model.definition.variants.length ? model.definition.variants : [null];
  for (const print of model.definition.prints) {
    const res = resources.find((r) => r.title === print.base);
    if (!res) continue; // the static validator reports a missing base
    const base = await download("mission-resources", res.storage_path);
    if (!base || !/pdf/.test(base.mime)) {
      issues.push({ code: "print_base_unreadable", severity: "blocking", category: "assets", screenKey: null, detail: `Printable "${print.title}": "${print.base}" is not a readable PDF.` });
      continue;
    }
    const images = new Map<string, { bytes: Uint8Array; mime: string }>();
    for (const im of print.images) {
      const a = media.find((m) => m.key === im.asset);
      const file = a ? await download("mission-media", a.storage_path) : null;
      if (file) images.set(im.asset, file);
    }
    const seen = new Set<string>();
    for (const v of variants) {
      const forced = v ? { ...model, definition: { ...model.definition, variants: [{ ...v, weight: 1 }] } } : model;
      const state = startRun(forced, emptyMissionState, model.screens[0]?.screenKey ?? null, new Date("2000-01-01T00:00:00Z"), 1).state;
      try {
        const out = await renderPrint(base.bytes, print, state, { images });
        for (const i of out.issues) {
          const detail = `Printable "${print.title}"${v ? ` (variant ${v.label})` : ""}: ${i.detail}`;
          if (seen.has(detail)) continue;
          seen.add(detail);
          issues.push({ code: i.code, severity: "blocking", category: "assets", screenKey: null, detail });
        }
      } catch {
        issues.push({ code: "print_render_failed", severity: "blocking", category: "assets", screenKey: null, detail: `Printable "${print.title}" could not be made${v ? ` for variant ${v.label}` : ""}.` });
      }
    }
  }
  return issues;
}
