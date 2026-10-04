import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CodeEntryScreen } from "../screens/library";
import { MediaBlocks } from "../media-blocks";
import { emptyMissionState } from "@/features/mission-engine/schemas";
import { printChecklist } from "@/features/admin/print-checklist";
import { buildModel } from "@/features/mission-engine/definition";

/*
 * Plan §11 — interaction state survives an accidental interruption, and
 * animation never starts on its own. Plan §12 — the print checklist.
 */

const props = () => ({
  screen: { screenKey: "code", type: "code_entry" as const, title: "Code", body: null, sequence: 1, configuration: { prompt: "What does it say?" } },
  state: emptyMissionState, missionSlug: "m", onAdvance: vi.fn(), isPending: false,
});

describe("in-progress input after an accidental reload", () => {
  beforeEach(() => sessionStorage.clear());

  it("is restored, and cleared once submitted", async () => {
    const first = render(<CodeEntryScreen {...props()} />);
    fireEvent.change(screen.getByLabelText("Enter it here"), { target: { value: "open the" } });
    first.unmount(); // the tab reloads
    const p = props();
    render(<CodeEntryScreen {...p} />);
    await act(async () => { await Promise.resolve(); });
    expect((screen.getByLabelText("Enter it here") as HTMLInputElement).value).toBe("open the");
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(p.onAdvance).toHaveBeenCalledWith({ kind: "submit", screenKey: "code", value: "open the" });
    expect(Object.keys(sessionStorage).filter((k) => k.startsWith("wla-draft:m:code:"))).toEqual([]);
  });

  it("blocked storage simply restores nothing", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<CodeEntryScreen {...props()} />);
    await act(async () => { await Promise.resolve(); });
    expect((screen.getByLabelText("Enter it here") as HTMLInputElement).value).toBe("");
    spy.mockRestore();
  });
});

describe("animation (reduced motion)", () => {
  it("does not play until asked, and shows its description meanwhile", () => {
    const asset = { key: "a", kind: "animation" as const, url: "https://x/a.gif", alt: "The water rises over the stones.", longDescription: null, transcript: null, captionsUrl: null };
    render(<MediaBlocks blocks={[{ display: "inline", asset }]} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("The water rises over the stones.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play the animation" }));
    expect(screen.getByRole("img", { name: "The water rises over the stones." })).toBeTruthy();
  });
});

describe("print-resource checklist", () => {
  it("says what depends on each Kit item and what the Kit is missing", () => {
    const model = buildModel({
      definition: { qr: [{ key: "q", label: "Tower card", action: "resource", resource: "Map" }], prints: [{ key: "p", title: "Code card", base: "Card base", fields: [{ text: "x", x: 1, y: 1 }] }] },
      screens: [{ screenKey: "s", type: "content", title: "Start", body: null, sequence: 1, configuration: { requiredResourceIds: ["Map"] } }],
      completionRule: null,
    });
    const { rows, missing } = printChecklist(model, [{ title: "Map", type: "pdf", can_print: true }, { title: "Spare", type: "pdf", can_print: false }]);
    expect(rows.find((r) => r.title === "Map")!.usedBy).toEqual(['needed on "Start"', 'QR code "Tower card"']);
    expect(rows.find((r) => r.title === "Spare")!.notes[0]).toMatch(/Nothing in the mission points at it/);
    expect(missing).toEqual([{ title: "Card base", usedBy: ['base of printable "Code card"'] }]);
  });
});
