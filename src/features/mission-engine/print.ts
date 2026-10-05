import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { evaluate } from "./conditions";
import type { PrintDef } from "./definition";
import { readVariable } from "./variables";
import type { MissionStateData } from "./schemas";

/**
 * DYNAMIC PRINTABLES (Plan §5, D-93, D-101) — an approved base PDF filled for
 * one run. The base carries WLA's presentation; this adds only the authored
 * fields (in WLA's own typefaces, Karla and Fraunces, embedded and subset),
 * the variant's images, and the variant's selection of pages.
 *
 * It also reports how the output came out — a field that would not fit, a
 * field off its page, a missing page or image — so mission QA can render every
 * variant before publication (`printQa` in lms-queries) and a run's print is
 * never silently wrong.
 */
const MM = 72 / 25.4;
const MIN_SIZE = 8;
const CHARCOAL = rgb(0.23, 0.22, 0.2); // WLA charcoal; PDF colours cannot read CSS tokens

export type PrintIssue = { code: "print_field_overflow" | "print_field_off_page" | "print_page_missing" | "print_image_missing" | "print_no_pages"; detail: string };
export type PrintImages = Map<string, { bytes: Uint8Array; mime: string }>;

const FONT_FILES = {
  body: "karla-latin-400-normal.woff",
  body_bold: "karla-latin-700-normal.woff",
  display: "fraunces-latin-600-normal.woff",
} as const;

async function fontBytes(name: keyof typeof FONT_FILES): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path.join(process.cwd(), "assets", "fonts", FONT_FILES[name])));
  } catch {
    return null;
  }
}

export function fillText(text: string, state: MissionStateData): string {
  return text.replace(/\{\{\s*var\.([a-z0-9_.]+)\s*\}\}/g, (_, k: string) => {
    const v = readVariable(state, k);
    if (v === undefined || v === null) return "";
    return Array.isArray(v) ? v.join(", ") : String(v);
  });
}

export async function renderPrint(
  base: Uint8Array,
  def: PrintDef,
  state: MissionStateData,
  opts: { now?: Date; images?: PrintImages } = {},
): Promise<{ bytes: Uint8Array; issues: PrintIssue[]; drawn: { text: string; page: number; size: number; font: string }[] }> {
  const now = opts.now ?? new Date();
  const holds = (c: unknown) => !c || evaluate(c as never, { state, now });
  const issues: PrintIssue[] = [];
  // What was set, in order — embedded subset fonts store glyph ids, not
  // characters, so this is how tests and QA read the output back.
  const drawn: { text: string; page: number; size: number; font: string }[] = [];
  const src = await PDFDocument.load(base);
  src.registerFontkit(fontkit);

  const fonts = new Map<string, PDFFont>();
  const fontFor = async (name: keyof typeof FONT_FILES) => {
    if (!fonts.has(name)) {
      const bytes = await fontBytes(name);
      // Falls back to a standard face only if the WLA files are missing from the deployment.
      fonts.set(name, bytes ? await src.embedFont(bytes, { subset: true }) : await src.embedFont(StandardFonts.Helvetica));
    }
    return fonts.get(name)!;
  };

  const pages = src.getPages();
  for (const f of def.fields) {
    if (!holds(f.when)) continue;
    const page = pages[f.page];
    if (!page) { issues.push({ code: "print_page_missing", detail: `A field is placed on page ${f.page + 1}, which the base does not have.` }); continue; }
    const { width, height } = page.getSize();
    const font = await fontFor(f.font);
    const text = fillText(f.text, state);
    if (!text.trim()) continue;
    let size = f.size;
    const room = f.maxWidth !== undefined ? f.maxWidth * MM : width - f.x * MM;
    while (font.widthOfTextAtSize(text, size) > room && size > MIN_SIZE) size -= 0.5;
    const w = font.widthOfTextAtSize(text, size);
    if (w > room + 0.01) issues.push({ code: "print_field_overflow", detail: `"${text.slice(0, 40)}" does not fit in ${Math.round(room / MM)}mm even at ${MIN_SIZE}pt.` });
    const x = f.align === "center" && f.maxWidth !== undefined ? f.x * MM + (room - w) / 2 : f.x * MM;
    const y = height - f.y * MM - size;
    if (x < 0 || x >= width || x + w > width + 0.01 || y < 0 || f.y * MM > height) {
      issues.push({ code: "print_field_off_page", detail: `"${text.slice(0, 40)}" falls outside page ${f.page + 1}.` });
    }
    page.drawText(text, { x, y, size, font, color: CHARCOAL });
    drawn.push({ text, page: f.page, size, font: f.font });
  }

  for (const im of def.images) {
    if (!holds(im.when)) continue;
    const page = pages[im.page];
    const file = opts.images?.get(im.asset);
    if (!page) { issues.push({ code: "print_page_missing", detail: `Image "${im.asset}" is placed on page ${im.page + 1}, which the base does not have.` }); continue; }
    if (!file || !/png|jpe?g/.test(file.mime)) { issues.push({ code: "print_image_missing", detail: `Image "${im.asset}" is not a PNG or JPEG in this version's media.` }); continue; }
    const img = /png/.test(file.mime) ? await src.embedPng(file.bytes) : await src.embedJpg(file.bytes);
    const { height, width } = page.getSize();
    if ((im.x + im.w) * MM > width + 0.01 || (im.y + im.h) * MM > height + 0.01) issues.push({ code: "print_field_off_page", detail: `Image "${im.asset}" falls outside page ${im.page + 1}.` });
    page.drawImage(img, { x: im.x * MM, y: height - (im.y + im.h) * MM, width: im.w * MM, height: im.h * MM });
  }

  // Page selection for this variant.
  let out = src;
  if (def.pages) {
    const chosen = def.pages.filter((p) => holds(p.when)).map((p) => p.page);
    for (const p of chosen) if (!pages[p]) issues.push({ code: "print_page_missing", detail: `Page ${p + 1} is selected but the base does not have it.` });
    const keep = chosen.filter((p) => pages[p]);
    if (!keep.length) issues.push({ code: "print_no_pages", detail: "No pages are selected for this run." });
    out = await PDFDocument.create();
    const copied = await out.copyPages(src, keep);
    copied.forEach((pg) => out.addPage(pg));
  }
  out.setTitle(def.title);
  out.setProducer("WLA Academy");
  return { bytes: await out.save(), issues, drawn };
}
