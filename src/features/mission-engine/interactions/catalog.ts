import type { ScreenType } from "../schemas";

/**
 * THE SCREEN CATALOG — every type an author can choose, grouped as the
 * builder offers them, each with a starter template.
 *
 * Built-in types keep their original starters (blanks an author fills in).
 * Library types start from a small, complete example that saves, passes QA
 * and plays as it stands — an author edits a working screen rather than
 * assembling one from nothing. A test parses every template against its
 * schema, and plays every library template through the runtime.
 */

export type CatalogEntry = {
  type: ScreenType;
  label: string;
  family: "Story and guidance" | "Decisions" | "Entry and codes" | "Arranging" | "Quantities" | "Visual and spatial" | "Workspace" | "Ending";
  template: Record<string, unknown>;
};

export const screenCatalog: CatalogEntry[] = [
  { type: "content", family: "Story and guidance", label: "Content — text the child reads", template: { next: "" } },
  { type: "prepare", family: "Story and guidance", label: "Prepare — get materials ready", template: { materials: [""], next: "" } },
  { type: "handoff", family: "Story and guidance", label: "Handoff — go and do something physical", template: { location: "", steps: [""], returnInstruction: "", next: "" } },
  { type: "reveal", family: "Story and guidance", label: "Reveal — show something held back", template: { concealedPrompt: "", revealedBody: "", condition: { type: "child_action" }, next: "" } },
  { type: "reflection", family: "Story and guidance", label: "Reflection — think back", template: { prompts: [""], next: "" } },

  { type: "choice", family: "Decisions", label: "Decision — one choice, branches", template: { prompt: "", options: [{ id: "", label: "", next: "" }, { id: "", label: "", next: "" }] } },
  { type: "multi_choice", family: "Decisions", label: "Multi-choice — pick several", template: { prompt: "", options: [{ id: "", label: "" }, { id: "", label: "" }], next: "" } },
  {
    type: "compare", family: "Decisions", label: "Compare — side by side, or a decision matrix",
    template: {
      prompt: "Compare the two plans.",
      mode: "comparison",
      options: [{ id: "a", label: "Plan A" }, { id: "b", label: "Plan B" }],
      criteria: [{ id: "time", label: "Time it takes" }, { id: "risk", label: "What could go wrong" }],
      cells: { "a.time": "One afternoon", "a.risk": "Rain stops it", "b.time": "Two days", "b.risk": "Needs more help" },
      pick: true,
      pickPrompt: "Which plan will you follow?",
    },
  },
  { type: "response", family: "Entry and codes", label: "Response — write an answer", template: { prompt: "", next: "" } },
  {
    type: "numeric_entry", family: "Entry and codes", label: "Number — enter a measurement or count",
    template: { prompt: "How many steps did you count?", label: "Steps", unit: "steps", min: 0, max: 500, outcomes: [], onNoMatch: { mode: "retry" } },
  },
  {
    type: "code_entry", family: "Entry and codes", label: "Code — a code, word, phrase, passphrase or cipher answer",
    template: {
      prompt: "What does the message say?",
      mode: "cipher",
      hint: "Use the cipher wheel from your Mission Kit.",
      outcomes: [{ id: "solved", match: { values: ["open the gate"] } }],
      onNoMatch: { mode: "retry", message: "That doesn't open anything yet. Check the wheel and try again.", fallbackAfter: 5 },
    },
  },
  {
    type: "token_sequence", family: "Entry and codes", label: "Symbols — enter a sequence",
    template: {
      prompt: "Enter the symbols in the order you found them.",
      tokens: [{ id: "sun", label: "Sun", symbol: "☀" }, { id: "moon", label: "Moon", symbol: "☾" }, { id: "star", label: "Star", symbol: "★" }],
      length: 3,
      outcomes: [{ id: "found", match: { sequences: [["moon", "sun", "star"]] } }],
      onNoMatch: { mode: "retry", fallbackAfter: 5 },
    },
  },

  { type: "sort_items", family: "Arranging", label: "Sort (Six Names) — classify with a fixed answer", template: { prompt: "", categories: [{ id: "", label: "" }, { id: "", label: "" }], items: [{ id: "", text: "", classification: "" }], next: "" } },
  {
    type: "arrange", family: "Arranging", label: "Arrange — sort, sequence, reorder or rank",
    template: {
      prompt: "Put the steps in the order you would do them.",
      mode: "sequence",
      items: [{ id: "plan", label: "Make a plan" }, { id: "test", label: "Test it" }, { id: "fix", label: "Fix what failed" }],
      outcomes: [],
    },
  },
  {
    type: "matching", family: "Arranging", label: "Match — pair items",
    template: {
      prompt: "Match each clue to the place it points to.",
      left: [{ id: "c1", label: "Where water rests" }, { id: "c2", label: "Where paths cross" }],
      right: [{ id: "pond", label: "The pond" }, { id: "gate", label: "The gate" }],
      outcomes: [],
    },
  },

  { type: "tracker", family: "Quantities", label: "Tracker — record a position", template: { prompt: "", dimensions: [{ id: "", label: "", positions: ["", ""] }], next: "" } },
  { type: "tracker_confirmation", family: "Quantities", label: "Tracker confirmation", template: { rows: [{ label: "", position: "" }], next: "" } },
  {
    type: "allocate", family: "Quantities", label: "Allocate — sliders, weighting or sharing out",
    template: {
      prompt: "Share out 10 sandbags between the two walls.",
      mode: "allocation",
      total: 10,
      exact: true,
      totalLabel: "sandbags",
      controls: [{ id: "north", label: "North wall", min: 0, max: 10 }, { id: "south", label: "South wall", min: 0, max: 10 }],
      outcomes: [],
    },
  },
  {
    type: "inventory", family: "Quantities", label: "Inventory — choose what to carry",
    template: {
      prompt: "You can carry three things. What will you take?",
      items: [{ id: "rope", label: "Rope" }, { id: "torch", label: "Torch" }, { id: "map", label: "Map" }, { id: "water", label: "Water" }],
      min: 1,
      max: 3,
    },
  },
  {
    type: "simulation", family: "Quantities", label: "Simulation — set, run, observe, adjust",
    template: {
      prompt: "Set the ramp and let the ball go.",
      controls: [{ id: "height", label: "Ramp height", min: 1, max: 5, default: 1, ends: ["Low", "High"], storeAs: "ramp_height" }],
      readouts: [
        { when: { ref: { var: "ramp_height" }, op: "gte", value: 4 }, text: "The ball flies past the target." },
        { when: { always: true }, text: "The ball rolls, then slows." },
      ],
      minRuns: 1,
    },
  },

  {
    type: "hotspot", family: "Visual and spatial", label: "Hotspot — find or annotate parts of an image",
    template: {
      prompt: "Which part of the bridge is carrying the most weight?",
      mode: "find",
      image: { src: "/missions/placeholder-bridge.svg", alt: "A simple bridge drawing with a deck, two towers and cables." },
      regions: [{ id: "deck", label: "The deck", x: 5, y: 60, w: 90, h: 15 }, { id: "towers", label: "The towers", x: 20, y: 10, w: 15, h: 50 }, { id: "cables", label: "The cables", x: 35, y: 15, w: 40, h: 40 }],
      outcomes: [],
    },
  },
  { type: "sketch", family: "Visual and spatial", label: "Sketch — a simple drawing", template: { prompt: "Sketch your plan.", store: false } },
  {
    type: "map", family: "Visual and spatial", label: "Map — build a route or connect places",
    template: {
      prompt: "Plan a route from the camp to the lookout.",
      mode: "route",
      nodes: [{ id: "camp", label: "Camp", x: 10, y: 80 }, { id: "stream", label: "Stream", x: 40, y: 60 }, { id: "wood", label: "Wood", x: 45, y: 25 }, { id: "lookout", label: "Lookout", x: 85, y: 20 }],
      edges: [["camp", "stream"], ["stream", "wood"], ["stream", "lookout"], ["wood", "lookout"]],
      start: "camp",
      end: "lookout",
      outcomes: [],
    },
  },
  {
    type: "pattern_grid", family: "Visual and spatial", label: "Pattern — build on a grid",
    template: {
      prompt: "Continue the pattern.",
      rows: 2,
      cols: 4,
      palette: [{ id: "a", label: "Circle", symbol: "●" }, { id: "b", label: "Square", symbol: "■" }],
      given: ["a", "b", "", "", "b", "a", "", ""],
      outcomes: [],
    },
  },

  { type: "workspace", family: "Workspace", label: "Workspace — a board that persists across screens", template: { prompt: "Place each clue where you think it belongs.", workspace: "board" } },

  { type: "completion", family: "Ending", label: "Completion — the end", template: { message: "", trailEntries: [] } },
];

export function templateFor(type: string): Record<string, unknown> {
  return screenCatalog.find((e) => e.type === type)?.template ?? {};
}
