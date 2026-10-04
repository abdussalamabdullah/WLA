import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PrintDef } from "./definition";
import { readVariable } from "./variables";
import type { MissionStateData } from "./schemas";

/**
 * DYNAMIC PRINTABLES (Plan §5) — fill an approved base PDF with this run's
 * values. The base carries WLA's presentation; this adds only the authored
 * fields, in charcoal, at authored positions. Pure apart from the PDF work:
 * the caller has authorised the run and fetched the base.
 */
const MM = 72 / 25.4;

export function fillText(text: string, state: MissionStateData): string {
  return text.replace(/\{\{\s*var\.([a-z0-9_.]+)\s*\}\}/g, (_, k: string) => {
    const v = readVariable(state, k);
    if (v === undefined || v === null) return "";
    return Array.isArray(v) ? v.join(", ") : String(v);
  });
}

export async function renderPrint(base: Uint8Array, def: PrintDef, state: MissionStateData): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(base);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  for (const f of def.fields) {
    const page = pages[f.page];
    if (!page) continue;
    const { height } = page.getSize();
    // Standard fonts cover WinAnsi only; anything else is dropped rather than failing the print.
    const text = fillText(f.text, state).replace(/[^\x20-\x7e -ÿ]/g, "");
    page.drawText(text, { x: f.x * MM, y: height - f.y * MM - f.size, size: f.size, font, color: rgb(0.23, 0.22, 0.2) });
  }
  pdf.setTitle(def.title);
  pdf.setProducer("WLA Academy");
  return pdf.save();
}
