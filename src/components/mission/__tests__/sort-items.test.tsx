import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SortItemsScreen } from "../screens/six-names-types";
import { emptyMissionState } from "@/features/mission-engine/schemas";

/*
 * Found in staging QA: the shuffle effect depended on a config object that was
 * re-parsed every render, so it re-ran after every render — an endless
 * shuffle loop that starved the transition to the next screen ("Saving…" for
 * ever) and re-shuffled the list under the child. Rendered, not read.
 */
const configuration = {
  prompt: "Seen, said or unknown?",
  categories: [{ id: "seen", label: "Seen" }, { id: "said", label: "Said" }],
  items: Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, text: `Item text ${i}`, classification: "seen" })),
  shuffle: true,
  next: "after",
};
const props = (isPending: boolean) => ({
  screen: { screenKey: "sort", type: "sort_items" as const, title: "Sort", body: null, sequence: 1, configuration },
  state: emptyMissionState,
  missionSlug: "m",
  onAdvance: () => {},
  isPending,
});

// With the defect, React re-renders without end; the timeout turns that hang
// into a failure (mutation-tested: the pre-fix component never finishes).
describe("sort screen", () => {
  it("shuffles once and settles — no render loop", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(<SortItemsScreen {...props(false)} />);
    const first = screen.getByText(/^Item text \d$/).textContent;
    for (let i = 0; i < 5; i++) rerender(<SortItemsScreen {...props(i % 2 === 0)} />);
    expect(screen.getByText(/^Item text \d$/).textContent).toBe(first);
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/Maximum update depth/);
    errors.mockRestore();
  }, 10_000);
});
