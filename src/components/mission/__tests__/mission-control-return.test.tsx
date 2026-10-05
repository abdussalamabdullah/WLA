import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MissionControl } from "../mission-control";
import { MissionContextProvider } from "../mission-context";

/*
 * D-103 — "Mission Control states with no valid return" (Plan §12) is made
 * impossible by structure, and these tests hold the structure in place:
 *   1. Mission Control cannot advance the mission: it is never given a way to
 *      (no onAdvance prop) and it never calls one.
 *   2. Every opening has a way back to the same screen — an explicit close
 *      and Escape — and focus returns to where the child was.
 *   3. Its only link away (materials → Kit) is checked by mission QA
 *      (mission_control_no_return), and the Kit offers the way back.
 */

const ctx = (report = vi.fn()) => ({
  missionSlug: "m", mode: "learner" as const, report,
  support: [
    { title: "Look again", body: "Check the second name.", level: 1 },
    { title: "Find the card", body: "It's in your Kit.", level: 2, kind: "materials" as const, resource: "Name cards" },
  ],
});

describe("Mission Control always returns the child to where they were", () => {
  it("has no way to advance the mission", () => {
    const src = readFileSync(join(__dirname, "../mission-control.tsx"), "utf8");
    expect(src).not.toMatch(/onAdvance|recordInteraction|kind:\s*"(visit|submit|choice)"/);
  });

  it("closes back to the same screen by button and by Escape, returning focus", async () => {
    render(<MissionContextProvider value={ctx()}><MissionControl support={[]} /></MissionContextProvider>);
    const trigger = screen.getByRole("button", { name: "Mission Control" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to the mission" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("its only link away goes to the mission's own Kit, which leads back", () => {
    render(<MissionContextProvider value={ctx()}><MissionControl support={[]} /></MissionContextProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Mission Control" }));
    fireEvent.click(screen.getByRole("button", { name: "More help" }));
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toEqual(["/academy/missions/m/kit"]);
    const kit = readFileSync(join(__dirname, "../../../app/(academy)/academy/missions/[missionId]/kit/page.tsx"), "utf8");
    expect(kit).toMatch(/href=\{`\/academy\/missions\/\$\{[^}]+\}`\}/);
  });
});
