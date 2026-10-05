import { describe, expect, it } from "vitest";
import { buildModel } from "../definition";
import { applyQr, step } from "../runtime";
import { emptyMissionState, type ScreenType } from "../schemas";
import { validateMission, blocking } from "../validator";

/*
 * Physical ↔ digital mechanics (Plan §5): Kit QR codes.
 */

const now = new Date("2026-10-04T12:00:00Z");
const sc = (screenKey: string, type: string, configuration: unknown, sequence: number) =>
  ({ screenKey, type: type as ScreenType, title: screenKey, body: null, sequence, configuration });

const model = buildModel({
  definition: {
    completion: { ref: { visited: "end" }, op: "exists" },
    qr: [
      { key: "map_card", label: "The map card", action: "unlock", unlock: "map", when: { ref: { visited: "start" }, op: "exists" } },
      { key: "kit", label: "Kit", action: "resource", resource: "Map card" },
      { key: "open", label: "Open", action: "open" },
    ],
  },
  screens: [
    sc("start", "content", { next: "secret", otherwise: "end" }, 1),
    sc("secret", "content", { next: "end", requires: { ref: { unlocked: "map" }, op: "exists" } }, 2),
    sc("end", "content", { next: "done" }, 3),
    sc("done", "completion", { message: "x" }, 4),
  ],
  completionRule: null,
});

describe("Kit QR codes", () => {
  it("scan-to-reveal waits for its condition, then unlocks once", () => {
    const early = applyQr(model, emptyMissionState, "map_card", now);
    expect(early.applied).toBe(false);
    expect(early.events[0]).toMatchObject({ name: "qr_scanned", detail: { outcome: "not_yet" } });

    const after = step(model, emptyMissionState, "start", { kind: "visit", screenKey: "start" }, now);
    expect(after.ok && after.nextScreenKey).toBe("end"); // gated screen skipped without the unlock
    const scanned = applyQr(model, after.ok ? after.state : emptyMissionState, "map_card", now);
    expect(scanned.applied).toBe(true);
    expect(scanned.state.unlocked).toContain("map");
    const again = applyQr(model, scanned.state, "map_card", now);
    expect(again.applied).toBe(false);
    expect(again.events[0].detail).toMatchObject({ outcome: "already" });
  });

  it("an unlocked scan opens gated content on the route", () => {
    const st = applyQr(model, { ...emptyMissionState, visitedScreens: ["start"] }, "map_card", now).state;
    const r = step(model, st, "start", { kind: "visit", screenKey: "start" }, now);
    expect(r.ok && r.nextScreenKey).toBe("secret");
  });

  it("a resource or open code never changes the run", () => {
    for (const k of ["kit", "open"]) {
      const r = applyQr(model, emptyMissionState, k, now);
      expect(r.applied).toBe(false);
      expect(r.state).toBe(emptyMissionState);
    }
  });

  it("an unknown code is nothing (another mission's codes do not exist here)", () => {
    expect(applyQr(model, emptyMissionState, "elsewhere", now).qr).toBeNull();
  });

  it("QA reaches content that only a scan unlocks", () => {
    // A code valid from the start: scanning before leaving `start` opens `secret`.
    const open = buildModel({ definition: { ...model.definition, qr: [{ key: "map_card", label: "Map", action: "unlock", unlock: "map" }] }, screens: model.screens, completionRule: null });
    const { issues, paths } = validateMission(open, { kitTitles: ["Map card"] });
    expect(blocking(issues)).toEqual([]);
    expect(paths.some((p) => p.screens.includes("secret"))).toBe(true);
  });

  it("QA reports content a code can only unlock too late", () => {
    // `map_card` is valid only after `start`, which is the only way to `secret`.
    expect(validateMission(model, { kitTitles: ["Map card"] }).issues.map((i) => i.code)).toContain("unreachable_screen");
  });

  it("QA catches codes that point nowhere or do nothing", () => {
    const bad = buildModel({
      definition: { ...model.definition, qr: [
        { key: "a", label: "A", action: "resource", resource: "Missing" },
        { key: "a", label: "A again", action: "open" },
        { key: "b", label: "B", action: "unlock" },
      ] },
      screens: model.screens,
      completionRule: null,
    });
    const codes = validateMission(bad, { kitTitles: ["Map card"] }).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["qr_missing_resource", "duplicate_qr", "qr_does_nothing"]));
  });
});

import { PDFDocument, PDFName } from "pdf-lib";
import { fillText, renderPrint } from "../print";
import { printDef } from "../definition";

describe("dynamic printables", () => {
  const state = { ...emptyMissionState, variables: { code: "RIVER-7", clues: ["a", "b"] } };

  it("fills fields from the run, hidden variables included", () => {
    expect(fillText("Your code: {{var.code}} · {{var.clues}} · {{var.none}}", state)).toBe("Your code: RIVER-7 · a, b · ");
  });

  it("keeps the approved base and adds the fields", async () => {
    const base = await PDFDocument.create();
    base.addPage([595, 842]);
    base.setTitle("Base");
    const { bytes, drawn } = await renderPrint(await base.save(), printDef.parse({ key: "card", title: "Your code card", base: "Card", fields: [{ text: "{{var.code}}", page: 0, x: 20, y: 30, size: 18 }, { text: "x", page: 9, x: 0, y: 0, size: 12 }] }), state);
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(1);
    expect(out.getTitle()).toBe("Your code card");
    expect(bytes.length).toBeGreaterThan((await base.save()).length);
    expect(drawn.map((d) => d.text)).toContain("RIVER-7");
  });

  it("QA catches a missing base, an undeclared field and an unknown printable", () => {
    const m = buildModel({
      definition: { completion: { ref: { visited: "end" }, op: "exists" }, prints: [{ key: "card", title: "Card", base: "Nope", fields: [{ text: "{{var.ghost}}", x: 1, y: 1 }] }] },
      screens: [sc("a", "content", { next: "end", prints: ["card", "other"] }, 1), sc("end", "completion", { message: "x" }, 2)],
      completionRule: null,
    });
    const codes = validateMission(m, { kitTitles: ["Card base"] }).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["print_missing_base", "undeclared_variable", "broken_reference"]));
  });
});

import { inRange } from "../interactions/contracts";

describe("device input (compass, tilt, shakes)", () => {
  const dev = (config: Record<string, unknown>) => buildModel({
    definition: { completion: { ref: { visited: "end" }, op: "exists" } },
    screens: [sc("d", "device_input", { prompt: "Which way?", next: "end", ...config }, 1), sc("end", "content", { next: "done" }, 2), sc("done", "completion", { message: "x" }, 3)],
    completionRule: null,
  });
  const submit = (m: ReturnType<typeof dev>, value: unknown) => step(m, emptyMissionState, "d", { kind: "submit", screenKey: "d", value }, now);

  it("compass ranges wrap through north", () => {
    expect(inRange("compass", 350, { min: 315, max: 45 })).toBe(true);
    expect(inRange("compass", 10, { min: 315, max: 45 })).toBe(true);
    expect(inRange("compass", 180, { min: 315, max: 45 })).toBe(false);
  });

  it("a sensor reading and the manual route are graded the same way", () => {
    const m = dev({ outcomes: [{ id: "north", match: { min: 315, max: 45 }, next: "end" }] });
    for (const source of ["sensor", "manual"]) {
      const r = submit(m, { reading: 0, source });
      expect(r.ok && r.state.outcomes.d).toBe("north");
    }
    expect(submit(m, { reading: 180, source: "sensor" }).ok).toBe(false);
  });

  it("refuses impossible readings and unknown sources", () => {
    const m = dev({ mode: "tilt" });
    expect(submit(m, { reading: 120, source: "sensor" }).ok).toBe(false);
    expect(submit(m, { reading: 10, source: "camera" }).ok).toBe(false);
    expect(submit(dev({ mode: "motion" }), { reading: 2.5, source: "sensor" }).ok).toBe(false);
  });

  it("QA blocks a compass outcome no manual direction can reach", () => {
    const codes = validateMission(dev({ outcomes: [{ id: "narrow", match: { min: 10, max: 30 } }] })).issues.map((i) => i.code);
    expect(codes).toContain("no_manual_route");
  });
});

describe("timed stages (server time)", () => {
  const timed = buildModel({
    definition: {},
    screens: [sc("t", "content", { next: "n", timer: { seconds: 30 } }, 1), sc("n", "content", {}, 2)],
    completionRule: null,
  });
  const entered = (secondsAgo: number) => ({ ...emptyMissionState, marks: { "screen:t": new Date(now.getTime() - secondsAgo * 1000).toISOString() } });
  it("accepts expiry within the tolerance, refuses it earlier", () => {
    expect(() => step(timed, entered(20), "t", { kind: "timer_expired", screenKey: "t" }, now)).toThrow();
    const r = step(timed, entered(28.5), "t", { kind: "timer_expired", screenKey: "t" }, now);
    expect(r.ok && r.nextScreenKey).toBe("n");
  });
});

describe("printables to the WLA print standard (D-101)", () => {
  const mk = async (pages = 2) => { const d = await PDFDocument.create(); for (let i = 0; i < pages; i++) d.addPage([595, 842]); return d.save(); };
  const st = (vars: Record<string, unknown>, extra: Partial<typeof emptyMissionState> = {}) => ({ ...emptyMissionState, variables: vars, ...extra });

  it("sets fields in WLA's own typefaces (embedded Karla/Fraunces, not Helvetica)", async () => {
    const { bytes, issues, drawn } = await renderPrint(await mk(1), printDef.parse({ key: "c", title: "Card", base: "B", fields: [{ text: "Hello", x: 10, y: 10, font: "display" }, { text: "World", x: 10, y: 30 }] }), st({}));
    expect(issues).toEqual([]);
    expect(drawn.map((d) => [d.text, d.font])).toEqual([["Hello", "display"], ["World", "body"]]);
    const doc = await PDFDocument.load(bytes);
    const baseFonts = doc.context.enumerateIndirectObjects()
      .map(([, o]) => (o as { get?: (k: unknown) => unknown }).get?.(PDFName.of("BaseFont")))
      .filter(Boolean).map(String);
    expect(baseFonts.some((f) => /Fraunces/.test(f))).toBe(true);
    expect(baseFonts.some((f) => /Karla/.test(f))).toBe(true);
    expect(baseFonts.some((f) => /Helvetica/.test(f))).toBe(false);
  });

  it("shrinks long text to fit its width, and reports text that cannot fit even at 8pt", async () => {
    const def = printDef.parse({ key: "c", title: "Card", base: "B", fields: [{ text: "{{var.clue}}", x: 10, y: 10, size: 20, maxWidth: 40 }] });
    expect((await renderPrint(await mk(1), def, st({ clue: "The old mill" }))).issues).toEqual([]);
    const long = (await renderPrint(await mk(1), def, st({ clue: "x".repeat(120) }))).issues;
    expect(long.map((i) => i.code)).toContain("print_field_overflow");
  });

  it("reports anything placed off the page or on a page the base lacks", async () => {
    const def = printDef.parse({ key: "c", title: "Card", base: "B", fields: [{ text: "far", x: 300, y: 10 }, { text: "p3", page: 2, x: 1, y: 1 }] });
    const codes = (await renderPrint(await mk(1), def, st({}))).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["print_field_off_page", "print_page_missing"]));
  });

  it("prints conditional fields only when they hold", async () => {
    const def = printDef.parse({ key: "c", title: "Card", base: "B", fields: [{ text: "ROUTE-NORTH", x: 10, y: 10, when: { ref: { var: "route" }, op: "eq", value: "north" } }] });
    expect((await renderPrint(await mk(1), def, st({ route: "north" }))).drawn.map((d) => d.text)).toContain("ROUTE-NORTH");
    expect((await renderPrint(await mk(1), def, st({ route: "south" }))).drawn).toEqual([]);
  });

  it("selects pages per variant", async () => {
    const def2 = printDef.parse({ key: "c", title: "Cards", base: "B", pages: [{ page: 0 }, { page: 1, when: { ref: { variant: true }, op: "eq", value: "hard" } }] });
    const easy = await PDFDocument.load((await renderPrint(await mk(2), def2, st({}, { variant: "easy" }))).bytes);
    const hard = await PDFDocument.load((await renderPrint(await mk(2), def2, st({}, { variant: "hard" }))).bytes);
    expect([easy.getPageCount(), hard.getPageCount()]).toEqual([1, 2]);
  });

  it("places a variant's image, and reports one that is missing", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    const def = printDef.parse({ key: "c", title: "Card", base: "B", images: [{ asset: "map", x: 10, y: 10, w: 50, h: 40 }] });
    const ok = await renderPrint(await mk(1), def, st({}), { images: new Map([["map", { bytes: new Uint8Array(png), mime: "image/png" }]]) });
    expect(ok.issues).toEqual([]);
    expect(Buffer.from(ok.bytes).toString("latin1")).toMatch(/\/Subtype\s*\/Image/);
    expect((await renderPrint(await mk(1), def, st({}))).issues.map((i) => i.code)).toContain("print_image_missing");
  });
});

describe("QA and real-world intervals (D-105, found by the no-code Builder run)", () => {
  it("a stage that opens later is reachable in mission QA", () => {
    const m = buildModel({
      definition: {
        completion: { ref: { visited: "later" }, op: "exists" },
        checkpoints: [{ key: "day_two", screenKey: "later", label: "Day two", availableAfter: { since: "screen:first", seconds: 86400 } }],
      },
      screens: [sc("first", "content", { next: "later" }, 1), sc("later", "content", { next: "end" }, 2), sc("end", "completion", { message: "x" }, 3)],
      completionRule: null,
    });
    const { issues, paths } = validateMission(m);
    expect(blocking(issues)).toEqual([]);
    expect(paths.some((p) => p.outcome === "complete")).toBe(true);
  });
});
