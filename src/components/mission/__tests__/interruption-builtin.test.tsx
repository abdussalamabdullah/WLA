import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MultiChoiceScreen, ResponseScreen, TrackerScreen } from "../screens";
import { SortItemsScreen } from "../screens/six-names-types";
import { emptyMissionState, type ScreenType } from "@/features/mission-engine/schemas";

/*
 * D-100 — interruption-proof input on the built-in screens Six Names uses.
 * Behaviour on an uninterrupted run is unchanged (the Six Names browser
 * regression covers that); these prove the reload case.
 */

const make = (screenKey: string, type: ScreenType, configuration: unknown, onAdvance = vi.fn()) => ({
  screen: { screenKey, type, title: "T", body: null, sequence: 1, configuration },
  state: emptyMissionState, missionSlug: "six", onAdvance, isPending: false,
});
const flush = () => act(async () => { await Promise.resolve(); });

describe("after an accidental reload", () => {
  beforeEach(() => sessionStorage.clear());

  it("a half-written response is still there, and cleared once saved", async () => {
    const r1 = render(<ResponseScreen {...make("wrap", "response", { prompt: "What did you notice?" })} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "The list changed" } });
    r1.unmount();
    const p = make("wrap", "response", { prompt: "What did you notice?" });
    render(<ResponseScreen {...p} />);
    await flush();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("The list changed");
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(p.onAdvance).toHaveBeenCalledWith({ kind: "response", screenKey: "wrap", value: "The list changed" });
    expect(Object.keys(sessionStorage).some((k) => k.startsWith("wla-draft:six:wrap:"))).toBe(false);
  });

  it("a partial multi-choice selection is still there", async () => {
    const cfg = { prompt: "Pick two", selectExactly: 2, options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }, { id: "c", label: "Gamma" }] };
    const r1 = render(<MultiChoiceScreen {...make("m", "multi_choice", cfg)} />);
    fireEvent.click(screen.getByRole("button", { name: /Alpha/ }));
    r1.unmount();
    render(<MultiChoiceScreen {...make("m", "multi_choice", cfg)} />);
    await flush();
    expect(screen.getByRole("button", { name: /Alpha/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Beta/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("a partly set tracker is still there", async () => {
    const cfg = { prompt: "Set it", dimensions: [{ id: "spread", label: "Spread", positions: ["Low", "Mid", "High"] }] };
    const r1 = render(<TrackerScreen {...make("t", "tracker", cfg)} />);
    fireEvent.click(screen.getByRole("button", { name: /^High/ }));
    r1.unmount();
    render(<TrackerScreen {...make("t", "tracker", cfg)} />);
    await flush();
    expect(screen.getByRole("button", { name: /^High/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("the sort keeps its order and the child's place", async () => {
    const cfg = { prompt: "Seen, said or unknown?", shuffle: true, categories: [{ id: "seen", label: "Seen" }, { id: "said", label: "Said" }],
      items: Array.from({ length: 4 }, (_, i) => ({ id: `i${i}`, text: `Item text ${i}`, classification: "seen" })) };
    const r1 = render(<SortItemsScreen {...make("sort", "sort_items", cfg)} />);
    await flush();
    const first = screen.getByText(/^Item text \d$/).textContent;
    fireEvent.click(screen.getByRole("button", { name: /^Seen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await flush();
    const second = screen.getByText(/^Item text \d$/).textContent;
    expect(second).not.toBe(first);
    r1.unmount();
    render(<SortItemsScreen {...make("sort", "sort_items", cfg)} />);
    await flush(); await flush();
    expect(screen.getByText(/^Item text \d$/).textContent).toBe(second);
  });
});
