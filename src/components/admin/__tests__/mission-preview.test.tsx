import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { MissionPreview } from "../mission-preview";
import type { MissionScreen } from "@/features/mission-engine/navigation";

/*
 * "Preview from here" (D-120) — rendered. The preview keeps its safety model
 * (in-memory state, the real runtime; mission-builder.test.ts guards that it
 * calls nothing that writes); these check the new starting point and path.
 */

const screens = [
  { screenKey: "intro", type: "content", title: "Welcome", body: "Hello", sequence: 10, configuration: { next: "pick" } },
  { screenKey: "pick", type: "choice", title: "Pick a path", body: null, sequence: 20, configuration: { prompt: "Which way?", options: [{ id: "left", label: "Left", next: "end" }, { id: "right", label: "Right", next: "end" }] } },
  { screenKey: "end", type: "completion", title: "The end", body: null, sequence: 30, configuration: { message: "Done", trailEntries: [] } },
] as MissionScreen[];

const renderPreview = (startAt: string | null) =>
  render(
    <MissionPreview
      missionTitle="Demo"
      missionSlug="demo"
      version={3}
      screens={screens}
      completionRule={{ type: "screen_reached", screenKey: "end" }}
      definition={{}}
      backHref="/admin/builder/demo/3"
      startAt={startAt}
    />,
  );

const pathList = () => within(screen.getByRole("heading", { name: "This test run’s path" }).parentElement as HTMLElement).getByRole("list");

describe("Preview from a chosen screen", () => {
  it("starts at that screen, says the state is fresh, and lists the path", () => {
    renderPreview("pick");
    expect(screen.getByRole("note").textContent).toMatch(/Started at “Pick a path” with a fresh test state/);
    expect(within(pathList()).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Pick a path"]);
    expect(screen.getByRole("button", { name: "Start again from “Pick a path”" })).toBeDefined();
  });

  it("ignores a key that isn't a screen of this draft and starts at the beginning", () => {
    renderPreview("not_a_screen");
    expect(screen.queryByRole("note")).toBeNull();
    expect(within(pathList()).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Welcome"]);
  });

  it("restarting from the beginning drops the chosen start", () => {
    renderPreview("pick");
    fireEvent.click(screen.getAllByRole("button", { name: "Start again from the beginning" })[0]);
    expect(screen.queryByRole("note")).toBeNull();
    expect(within(pathList()).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Welcome"]);
  });

  it("still says it is a test run that saves nothing", () => {
    renderPreview(null);
    expect(screen.getByText(/a test run: nothing here\s+is saved, and no learner’s progress is touched/)).toBeDefined();
  });
});
