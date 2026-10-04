import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { CheckpointWait, MissionTimer } from "../mission-timer";

describe("timed stages", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down visibly, then reports expiry once the grace has passed", () => {
    const onExpire = vi.fn();
    render(<MissionTimer seconds={5} visible onExpire={onExpire} />);
    expect(screen.getByRole("timer").textContent).toContain("0:05 left");
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole("timer").textContent).toContain("0:02 left");
    act(() => { vi.advanceTimersByTime(2100); });
    expect(onExpire).not.toHaveBeenCalled(); // within the grace
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("timer").textContent).toContain("Time is up");
  });

  it("does not restart when the parent re-renders with a new callback", () => {
    const first = vi.fn(), second = vi.fn();
    const { rerender } = render(<MissionTimer seconds={4} visible onExpire={first} />);
    act(() => { vi.advanceTimersByTime(3000); });
    rerender(<MissionTimer seconds={4} visible onExpire={second} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("reports expiry exactly once — a retry after the run moved on would be a stale step", () => {
    const onExpire = vi.fn();
    render(<MissionTimer seconds={1} visible onExpire={onExpire} />);
    act(() => { vi.advanceTimersByTime(30000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("a hidden timer still expires but shows nothing", () => {
    const onExpire = vi.fn();
    render(<MissionTimer seconds={1} visible={false} onExpire={onExpire} />);
    expect(screen.queryByRole("timer")).toBeNull();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(onExpire).toHaveBeenCalled();
  });
});

describe("checkpoint waits", () => {
  it("say when the stage opens and offer the way back", () => {
    render(<CheckpointWait seconds={3600} missionSlug="m" title="Day two" />);
    expect(screen.getByRole("heading", { name: "Day two" })).toBeTruthy();
    expect(screen.getByText(/opens at|opens on/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Mission Home" }).getAttribute("href")).toBe("/academy/missions/m");
  });
});
