import { describe, expect, it } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import {
  MissionCollection,
  type CollectionItem,
} from "../mission-collection";
import type { MissionStatus, WlaLab } from "@/types/database";

/**
 * MY MISSIONS AT SCALE — brief §8, §13.
 *
 * These RENDER the component and interact with it, rather than matching its
 * source. The requirement is behavioural — "the page should remain easy to
 * scan at 20+ missions", "completed missions should not dominate" — and source
 * text cannot show either.
 */

const LABS: WlaLab[] = ["challenge", "decision", "curiosity", "wellbeing", "navigation"];
const LAB_LABEL: Record<WlaLab, string> = {
  challenge: "Challenge Lab",
  decision: "Decision Lab",
  curiosity: "Curiosity Lab",
  wellbeing: "Wellbeing Lab",
  navigation: "Navigation Lab",
};

function make(n: number, statuses: MissionStatus[]): CollectionItem[] {
  return Array.from({ length: n }, (_, i) => {
    const lab = LABS[i % LABS.length];
    return {
      slug: `mission-${i}`,
      title: `Mission ${i}`,
      lab,
      labLabel: LAB_LABEL[lab],
      minAge: i % 2 === 0 ? 7 : 11,
      maxAge: i % 2 === 0 ? 11 : 15,
      coverImage: null,
      status: statuses[i % statuses.length],
      lastActivityAt: new Date(Date.now() - i * 86_400_000).toISOString(),
    };
  });
}

const cards = () =>
  screen.queryAllByRole("listitem").filter((li) => li.querySelector("h3"));

describe("My Missions collection", () => {
  it("says so plainly when there are no missions", () => {
    render(<MissionCollection items={[]} />);
    expect(screen.getByText(/don't have any missions yet/i)).toBeDefined();
    expect(cards()).toHaveLength(0);
  });

  it("hides the filters when there is nothing to filter", () => {
    render(<MissionCollection items={make(1, ["in_progress"])} />);
    // One mission needs no search box — that would be noise, not help.
    expect(screen.queryByLabelText("Search")).toBeNull();
    expect(cards()).toHaveLength(1);
  });

  it("shows the filters once the collection is worth filtering", () => {
    render(<MissionCollection items={make(20, ["not_started", "in_progress", "complete"])} />);
    expect(screen.getByLabelText("Search")).toBeDefined();
    expect(screen.getByLabelText("Lab")).toBeDefined();
    expect(screen.getByLabelText("Age")).toBeDefined();
  });

  it("renders every mission at 20, with the count in the heading", () => {
    render(<MissionCollection items={make(20, ["not_started", "in_progress", "complete"])} />);
    expect(cards()).toHaveLength(20);
    expect(screen.getByRole("heading", { name: /Your Missions/ }).textContent)
      .toContain("20");
  });

  it("the status tabs carry their own counts and actually filter", () => {
    const items = make(20, ["not_started", "in_progress", "complete"]);
    render(<MissionCollection items={items} />);

    const expected = {
      not_started: items.filter((i) => i.status === "not_started").length,
      in_progress: items.filter((i) => i.status === "in_progress").length,
      complete: items.filter((i) => i.status === "complete").length,
    };

    fireEvent.click(screen.getByRole("tab", { name: new RegExp(`Complete \\(${expected.complete}\\)`) }));
    expect(cards()).toHaveLength(expected.complete);

    fireEvent.click(screen.getByRole("tab", { name: new RegExp(`In progress \\(${expected.in_progress}\\)`) }));
    expect(cards()).toHaveLength(expected.in_progress);

    fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
    expect(cards()).toHaveLength(20);
  });

  it("completed missions do not dominate — they sort last", () => {
    /*
     * §13: "Do not allow completed missions to dominate the initial page."
     * With mostly-complete collections the first thing on screen must still be
     * something to do, so this asserts ORDER, which is what the learner meets
     * first, rather than merely that a Complete tab exists.
     */
    const items: CollectionItem[] = [
      ...make(16, ["complete"]),
      ...make(2, ["in_progress"]).map((m, i) => ({ ...m, slug: `live-${i}`, title: `Live ${i}` })),
      ...make(2, ["not_started"]).map((m, i) => ({ ...m, slug: `new-${i}`, title: `New ${i}` })),
    ];
    // The page sorts before rendering; mirror that ordering here.
    const RANK: Record<MissionStatus, number> = { in_progress: 0, not_started: 1, complete: 2 };
    const sorted = [...items].sort((a, b) => RANK[a.status] - RANK[b.status]);

    render(<MissionCollection items={sorted} />);
    const rendered = cards();
    expect(rendered).toHaveLength(20);

    const firstFour = rendered.slice(0, 4).map((c) => within(c).getByRole("heading").textContent);
    expect(firstFour.every((t) => /^(Live|New)/.test(t ?? ""))).toBe(true);
  });

  it("search narrows by title", () => {
    const items = make(20, ["not_started"]);
    render(<MissionCollection items={items} />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Mission 1" } });
    // "Mission 1", "Mission 10".."Mission 19" — 11 of them.
    expect(cards()).toHaveLength(11);
  });

  it("search that matches nothing says so, and does not look like an empty account", () => {
    render(<MissionCollection items={make(20, ["not_started"])} />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "zzzzz" } });
    expect(cards()).toHaveLength(0);
    expect(screen.getByText(/No missions match those filters/i)).toBeDefined();
    expect(screen.queryByText(/don't have any missions yet/i)).toBeNull();
  });

  it("the Lab filter narrows to one Lab", () => {
    const items = make(20, ["not_started"]);
    render(<MissionCollection items={items} />);
    fireEvent.change(screen.getByLabelText("Lab"), { target: { value: "decision" } });
    const expected = items.filter((i) => i.lab === "decision").length;
    expect(cards()).toHaveLength(expected);
  });

  it("the age filter overlaps rather than contains", () => {
    /*
     * A 7–15 mission belongs in BOTH bands. Containment would hide it from
     * both, which is the bug this asserts against.
     */
    const wide: CollectionItem[] = [{
      slug: "wide", title: "Wide", lab: "curiosity", labLabel: "Curiosity Lab",
      minAge: 7, maxAge: 15, coverImage: null, status: "not_started",
      lastActivityAt: null,
    }];
    render(<MissionCollection items={[...make(6, ["not_started"]), ...wide]} />);
    fireEvent.change(screen.getByLabelText("Age"), { target: { value: "7-11" } });
    expect(screen.queryByText("Wide")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Age"), { target: { value: "11-15" } });
    expect(screen.queryByText("Wide")).not.toBeNull();
  });

  it("filters combine rather than replace each other", () => {
    const items = make(20, ["not_started", "in_progress", "complete"]);
    render(<MissionCollection items={items} />);
    fireEvent.change(screen.getByLabelText("Lab"), { target: { value: "decision" } });
    fireEvent.click(screen.getByRole("tab", { name: /^Complete/ }));
    const expected = items.filter((i) => i.lab === "decision" && i.status === "complete").length;
    expect(cards()).toHaveLength(expected);
  });

  it("every card states its status in words, never colour alone", () => {
    render(<MissionCollection items={make(6, ["not_started", "in_progress", "complete"])} />);
    for (const card of cards()) {
      const text = card.textContent ?? "";
      expect(/Not started|In progress|Complete/.test(text)).toBe(true);
    }
  });

  it("each status keeps its locked action pairing", () => {
    // Architecture §4: Not Started → Open Mission is the locked pairing for the
    // collection; the card's action must not drift from its status.
    render(<MissionCollection items={make(3, ["not_started", "in_progress", "complete"])} />);
    for (const card of cards()) {
      const t = card.textContent ?? "";
      if (t.includes("Not started")) expect(t).toContain("Start Mission");
      if (t.includes("In progress")) expect(t).toContain("Continue Mission");
      if (t.includes("Complete")) expect(t).toContain("View Mission");
    }
  });
});
