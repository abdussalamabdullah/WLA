import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { EvidenceItem } from "../evidence-item";
import { buildModel } from "@/features/mission-engine/definition";
import { projectScreen } from "@/features/mission-engine/projection";
import { emptyMissionState, type ScreenType } from "@/features/mission-engine/schemas";
import { validateMission } from "@/features/mission-engine/validator";
import type { MissionEvidenceRow } from "@/types/database";

/*
 * F6 — the Trail shows when and how entries relate; later screens recall the
 * child's own words. Rendered and projected, not read from source.
 */

const row = (over: Partial<MissionEvidenceRow>): MissionEvidenceRow => ({
  id: "e2", child_id: "c", mission_id: "m", progress_id: "p", type: "digital", title: "Changed plan",
  description: "Go right", storage_path: null, created_at: "2026-10-04T10:00:00Z", source: "mission", ...over,
});

describe("Trail entries (Evidence v2)", () => {
  it("say when, whether during the mission, and what they relate to", () => {
    render(<ul><EvidenceItem evidence={row({ related_to: "e1", relation: "changed_plan_of" })} url={null} related={{ id: "e1", title: "First plan" }} /></ul>);
    const li = screen.getByRole("listitem");
    expect(within(li).getByText(/during the mission/)).toBeTruthy();
    expect(within(li).getByText("4 October 2026").tagName).toBe("TIME");
    const link = within(li).getByRole("link", { name: "First plan" });
    expect(link.getAttribute("href")).toBe("#entry-e1");
    expect(li.textContent).toContain("Changes the plan in");
    expect(li.id).toBe("entry-e2");
  });

  it("completion entries say 'at the end' and physical ones still never imply a copy", () => {
    render(<ul><EvidenceItem evidence={row({ type: "physical", source: "completion", description: null })} url={null} /></ul>);
    const li = screen.getByRole("listitem");
    expect(li.textContent).toMatch(/You keep this.*at the end/);
    expect(li.textContent).toContain("isn’t stored in the Academy");
    expect(within(li).queryByRole("link")).toBeNull();
  });
});

describe("recall (F6)", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const sc = (screenKey: string, type: string, configuration: unknown, sequence: number, body: string | null = null) =>
    ({ screenKey, type: type as ScreenType, title: null, body, sequence, configuration });
  const model = buildModel({
    definition: { completion: { ref: { visited: "end" }, op: "exists" } },
    screens: [
      sc("plan", "response", { prompt: "Your plan?", next: "pick" }, 1),
      sc("pick", "choice", { prompt: "Which?", options: [{ id: "a", label: "The north path", next: "back" }, { id: "b", label: "The river", next: "back" }] }, 2),
      sc("back", "content", { next: "end" }, 3, "You planned: {{response.plan}}. You chose {{choice.pick}}."),
      sc("end", "completion", { message: "Done" }, 4),
    ],
    completionRule: null,
  });

  it("shows the child their own earlier words and choice", () => {
    const state = { ...emptyMissionState, choices: { pick: "b" } };
    const page = projectScreen(model, model.screens[2], state, now, { responses: { plan: "Cross at the stones" } });
    expect(page.body).toBe("You planned: Cross at the stones. You chose The river.");
  });

  it("is empty, not broken, before there is anything to recall", () => {
    const page = projectScreen(model, model.screens[2], emptyMissionState, now);
    expect(page.body).toBe("You planned: . You chose .");
  });

  it("graded responses recall the typed value, not the stored wrapper", () => {
    const page = projectScreen(model, model.screens[2], emptyMissionState, now, { responses: { plan: { value: "OPEN", outcome: "ok" } } });
    expect(page.body).toContain("You planned: OPEN.");
  });

  it("QA flags recall of a screen that does not exist or collects nothing", () => {
    const bad = buildModel({
      definition: { completion: { ref: { visited: "end" }, op: "exists" } },
      screens: [sc("a", "content", { next: "end" }, 1, "{{response.ghost}} {{choice.end}}"), sc("end", "completion", { message: "x" }, 2)],
      completionRule: null,
    });
    const codes = validateMission(bad).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["recall_unknown_screen", "recall_wrong_kind"]));
  });
});
