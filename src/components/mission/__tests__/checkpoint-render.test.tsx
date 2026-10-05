import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MissionScreenRenderer } from "@/features/mission-engine/renderer";
import { emptyMissionState } from "@/features/mission-engine/schemas";

describe("a screen whose stage opens later", () => {
  it("renders the wait, not the screen", () => {
    render(<MissionScreenRenderer
      screen={{ screenKey: "later", type: "content", title: "Day two", body: "A day has passed.", sequence: 1, configuration: { next: "x" }, view: { waitSeconds: 600 } }}
      state={emptyMissionState} missionSlug="m" onAdvance={vi.fn()} />);
    expect(screen.getByText(/opens at|opens on/)).toBeTruthy();
    expect(screen.queryByText("A day has passed.")).toBeNull();
  });
});
