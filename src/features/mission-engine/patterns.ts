/**
 * THE MISSION PATTERN LIBRARY (Enhancement Plan §12) and THINKING PROMPTS (§7).
 *
 * A pattern is a proven WLA mission STRUCTURE — screens, logic states and
 * handoffs — inserted into a draft as ordinary, editable configuration. It is
 * not a template engine and not a mission: once inserted, every screen and
 * rule belongs to the mission and is edited like any other. Each pattern
 * passes mission QA and plays to an ending as inserted (patterns.test.ts), so
 * an author starts from something that works.
 *
 * Copy is placeholder in square brackets — written to be replaced, and
 * flagged by the validator's language checks if it is not.
 */

type Screen = { key: string; type: string; title: string | null; body: string | null; configuration: Record<string, unknown> };
type DefinitionPart = {
  variables?: Record<string, unknown>[];
  unlocks?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  workspaces?: Record<string, unknown>[];
};

export type MissionPattern = {
  id: string;
  name: string;
  summary: string;
  /** Build the pattern with every key prefixed, so it can be inserted beside existing screens. */
  build(p: string): { screens: Screen[]; definition: DefinitionPart };
};

const k = (p: string, key: string) => `${p}${key}`;

export const missionPatterns: MissionPattern[] = [
  {
    id: "choose_consequence_reconsider",
    name: "Choose → consequence → reconsider",
    summary: "A decision, what it led to, then the chance to stand by it or change it.",
    build: (p) => ({
      definition: {},
      screens: [
        { key: k(p, "choose"), type: "choice", title: "[The decision]", body: "[What the child knows so far]", configuration: {
          prompt: "[What will you do?]",
          options: [{ id: "a", label: "[Option A]", next: k(p, "consequence_a") }, { id: "b", label: "[Option B]", next: k(p, "consequence_b") }],
          convergeAt: k(p, "reconsider") } },
        { key: k(p, "consequence_a"), type: "content", title: "[What happened]", body: "[The consequence of A]", configuration: { next: k(p, "reconsider") } },
        { key: k(p, "consequence_b"), type: "content", title: "[What happened]", body: "[The consequence of B]", configuration: { next: k(p, "reconsider") } },
        { key: k(p, "reconsider"), type: "choice", title: "Looking again", body: `You chose {{choice.${k(p, "choose")}}}.`, configuration: {
          prompt: "[Would you stand by it, or change it?]",
          options: [{ id: "stand", label: "[Stand by it]" }, { id: "change", label: "[Change it]" }], next: k(p, "why") } },
        { key: k(p, "why"), type: "response", title: null, body: null, configuration: { prompt: "[Why?]",
          trail: { key: k(p, "judgement"), title: "[My judgement]", type: "digital", fromInput: true } } },
      ],
    }),
  },
  {
    id: "predict_test_reveal_adjust",
    name: "Predict → test → reveal → adjust",
    summary: "Say what will happen, try it physically, see the result, then revise the prediction.",
    build: (p) => ({
      definition: {},
      screens: [
        { key: k(p, "predict"), type: "response", title: "[Predict]", body: "[Set up the question]", configuration: {
          prompt: "[What do you think will happen?]", next: k(p, "test"),
          trail: { key: k(p, "prediction"), title: "[My prediction]", type: "digital", fromInput: true } } },
        { key: k(p, "test"), type: "handoff", title: null, body: null, configuration: {
          location: "[Where to go]", steps: ["[What to do]"], returnInstruction: "[Come back when you have tried it.]", next: k(p, "reveal") } },
        { key: k(p, "reveal"), type: "reveal", title: "[The result]", body: null, configuration: {
          concealedPrompt: "[Ready to see what usually happens?]", revealedBody: "[The result]", condition: { type: "child_action" }, next: k(p, "adjust") } },
        { key: k(p, "adjust"), type: "response", title: "[Adjust]", body: `You predicted: {{response.${k(p, "predict")}}}`, configuration: {
          prompt: "[What would you change about your prediction now?]",
          trail: { key: k(p, "revised"), title: "[My revised prediction]", type: "digital", fromInput: true, relatesTo: { key: k(p, "prediction"), relation: "revision_of" } } } },
      ],
    }),
  },
  {
    id: "clue_decode_unlock_investigate",
    name: "Clue → decode → unlock → investigate",
    summary: "A clue from the Kit, a code to work out, and a new line of investigation it opens.",
    build: (p) => ({
      definition: {},
      screens: [
        { key: k(p, "clue"), type: "handoff", title: null, body: null, configuration: {
          location: "[Your Mission Kit]", steps: ["[Find the clue card]", "[Work out the hidden word]"], returnInstruction: "[Come back with the word.]", next: k(p, "decode") } },
        { key: k(p, "decode"), type: "code_entry", title: "[Decode]", body: null, configuration: {
          prompt: "[What does the clue say?]", mode: "cipher", hint: "[Use the cipher from your Kit.]",
          outcomes: [{ id: "solved", match: { values: ["[answer]"] }, effects: [{ op: "unlock", key: k(p, "found") }] }],
          onNoMatch: { mode: "retry", fallbackAfter: 4, fallbackNext: k(p, "investigate") }, next: k(p, "investigate") } },
        { key: k(p, "investigate"), type: "content", title: "[What it opens]", body: "[The new line of investigation]", configuration: {
          routes: [{ when: { ref: { unlocked: k(p, "found") }, op: "exists" }, to: k(p, "notes") }], next: k(p, "notes") } },
        { key: k(p, "notes"), type: "response", title: null, body: null, configuration: { prompt: "[What do you notice now?]" } },
      ],
    }),
  },
  {
    id: "plan_change_reroute",
    name: "Plan → changed condition → reroute",
    summary: "Make a route, then something changes and the plan has to change with it.",
    build: (p) => ({
      definition: { variables: [{ key: k(p, "flooded"), type: "boolean", visibility: "visible", default: false }] },
      screens: [
        { key: k(p, "plan"), type: "map", title: "[Plan the route]", body: null, configuration: {
          prompt: "[Plan a route from start to finish.]", start: "start", end: "finish",
          nodes: [{ id: "start", label: "[Start]", x: 10, y: 80 }, { id: "ford", label: "[The ford]", x: 45, y: 55 }, { id: "bridge", label: "[The bridge]", x: 50, y: 20 }, { id: "finish", label: "[Finish]", x: 90, y: 40 }],
          edges: [["start", "ford"], ["start", "bridge"], ["ford", "finish"], ["bridge", "finish"]], next: k(p, "change"),
          effects: [{ op: "set", var: k(p, "flooded"), value: true }] } },
        { key: k(p, "change"), type: "content", title: "[Something changes]", body: "[The ford has flooded.]", configuration: { next: k(p, "reroute") } },
        { key: k(p, "reroute"), type: "map", title: "[Reroute]", body: null, configuration: {
          prompt: "[Plan a new route that avoids the ford.]", start: "start", end: "finish",
          nodes: [{ id: "start", label: "[Start]", x: 10, y: 80 }, { id: "bridge", label: "[The bridge]", x: 50, y: 20 }, { id: "finish", label: "[Finish]", x: 90, y: 40 }],
          edges: [["start", "bridge"], ["bridge", "finish"]], next: k(p, "why") } },
        { key: k(p, "why"), type: "response", title: null, body: null, configuration: { prompt: "[What made you change the plan?]",
          trail: { key: k(p, "changed_plan"), title: "[How my plan changed]", type: "digital", fromInput: true } } },
      ],
    }),
  },
  {
    id: "build_test_change_retest",
    name: "Build → test → change → retest",
    summary: "Make something physical, test it, change one thing, test again.",
    build: (p) => ({
      definition: {},
      screens: [
        { key: k(p, "build"), type: "handoff", title: null, body: null, configuration: { location: "[Your table]", steps: ["[Build it]"], returnInstruction: "[Come back when it is built.]", next: k(p, "test") } },
        { key: k(p, "test"), type: "numeric_entry", title: "[Test it]", body: null, configuration: { prompt: "[How far did it go?]", label: "[Distance]", unit: "cm", min: 0, max: 1000, next: k(p, "change") } },
        { key: k(p, "change"), type: "handoff", title: null, body: null, configuration: { location: "[Your table]", steps: ["[Change one thing]"], returnInstruction: "[Come back and test again.]", next: k(p, "retest") } },
        { key: k(p, "retest"), type: "numeric_entry", title: "[Test again]", body: null, configuration: { prompt: "[How far this time?]", label: "[Distance]", unit: "cm", min: 0, max: 1000, next: k(p, "compare") } },
        { key: k(p, "compare"), type: "response", title: "[What changed?]", body: `First: {{response.${k(p, "test")}}} cm. Then: {{response.${k(p, "retest")}}} cm.`, configuration: { prompt: "[What made the difference?]" } },
      ],
    }),
  },
  {
    id: "observe_evidence_revise",
    name: "Observe → evidence → explanation → new evidence → revise",
    summary: "Look closely, explain it, then meet evidence that changes the picture.",
    build: (p) => ({
      definition: {},
      screens: [
        { key: k(p, "observe"), type: "handoff", title: null, body: null, configuration: { location: "[Outside]", steps: ["[Observe closely]"], returnInstruction: "[Come back with what you saw.]", next: k(p, "explain") } },
        { key: k(p, "explain"), type: "response", title: "[Explain]", body: null, configuration: { prompt: "[What do you think explains it?]", next: k(p, "new_evidence"),
          trail: { key: k(p, "first"), title: "[My first explanation]", type: "digital", fromInput: true } } },
        { key: k(p, "new_evidence"), type: "reveal", title: "[New evidence]", body: null, configuration: { concealedPrompt: "[There is something else.]", revealedBody: "[The new evidence]", condition: { type: "child_action" }, next: k(p, "revise") } },
        { key: k(p, "revise"), type: "response", title: "[Revise]", body: `You first thought: {{response.${k(p, "explain")}}}`, configuration: { prompt: "[Does the new evidence change your explanation?]",
          trail: { key: k(p, "second"), title: "[My explanation now]", type: "digital", fromInput: true, relatesTo: { key: k(p, "first"), relation: "later_judgement_of" } } } },
      ],
    }),
  },
  {
    id: "allocate_event_rebalance",
    name: "Allocate → event → rebalance",
    summary: "Share out resources, something happens, share them out again.",
    build: (p) => ({
      definition: { variables: [{ key: k(p, "north"), type: "number", visibility: "visible", default: 0 }] },
      screens: [
        { key: k(p, "allocate"), type: "allocate", title: "[Share them out]", body: null, configuration: {
          prompt: "[Share out 6 sandbags.]", mode: "allocation", total: 6, exact: true, totalLabel: "[sandbags]",
          controls: [{ id: "north", label: "[North wall]", min: 0, max: 6, storeAs: k(p, "north") }, { id: "south", label: "[South wall]", min: 0, max: 6 }], next: k(p, "event") } },
        { key: k(p, "event"), type: "content", title: "[The storm comes from the north]", body: "You put {{var." + k(p, "north") + "}} on the north wall.", configuration: { next: k(p, "rebalance") } },
        { key: k(p, "rebalance"), type: "allocate", title: "[Rebalance]", body: null, configuration: {
          prompt: "[Share them out again.]", mode: "allocation", total: 6, exact: true, totalLabel: "[sandbags]",
          controls: [{ id: "north", label: "[North wall]", min: 0, max: 6 }, { id: "south", label: "[South wall]", min: 0, max: 6 }], next: k(p, "why") } },
        { key: k(p, "why"), type: "response", title: null, body: null, configuration: { prompt: "[What did you change, and why?]" } },
      ],
    }),
  },
  {
    id: "original_challenge_revised",
    name: "Original → challenge → revised",
    summary: "Make a first version, meet a challenge to it, make a revised version.",
    build: (p) => ({
      definition: {},
      screens: [
        { key: k(p, "original"), type: "response", title: "[Your first version]", body: null, configuration: { prompt: "[Write your first version.]", next: k(p, "challenge"),
          trail: { key: k(p, "v1"), title: "[My first version]", type: "digital", fromInput: true } } },
        { key: k(p, "challenge"), type: "content", title: "[A challenge]", body: "[Someone sees it differently: …]", configuration: { next: k(p, "revised") } },
        { key: k(p, "revised"), type: "response", title: "[Your revised version]", body: `Your first version: {{response.${k(p, "original")}}}`, configuration: { prompt: "[Write your revised version.]",
          trail: { key: k(p, "v2"), title: "[My revised version]", type: "digital", fromInput: true, relatesTo: { key: k(p, "v1"), relation: "revision_of" } } } },
      ],
    }),
  },
];

/** §7 — brief thinking prompts that can recall earlier state. Each is one screen. */
export const thinkingPrompts: { id: string; name: string; type: "response" | "reflection"; title: string; configuration: Record<string, unknown> }[] = [
  { id: "predict", name: "Predict", type: "response", title: "Predict", configuration: { prompt: "What do you think will happen?" } },
  { id: "notice", name: "Notice", type: "response", title: "Notice", configuration: { prompt: "What do you notice?" } },
  { id: "explain", name: "Explain", type: "response", title: "Explain", configuration: { prompt: "Why do you think that happened?" } },
  { id: "compare", name: "Compare", type: "response", title: "Compare", configuration: { prompt: "What is the same, and what is different?" } },
  { id: "reconsider", name: "Reconsider", type: "response", title: "Reconsider", configuration: { prompt: "Knowing what you know now, would you decide the same way?" } },
  { id: "what_changed", name: "What changed?", type: "response", title: "What changed?", configuration: { prompt: "What changed since the start?" } },
  { id: "what_stayed", name: "What stayed?", type: "response", title: "What stayed?", configuration: { prompt: "What stayed the same?" } },
  { id: "claim_support", name: "Claim + support", type: "response", title: "Claim and support", configuration: { prompt: "What do you claim, and what supports it?" } },
  { id: "perspective", name: "Perspective switch", type: "response", title: "Another view", configuration: { prompt: "How might someone else see this?" } },
  { id: "one_constraint", name: "Change one constraint", type: "response", title: "Change one thing", configuration: { prompt: "If one thing were different, what would change?" } },
  { id: "try_again", name: "Try again", type: "reflection", title: "Try again", configuration: { prompts: ["What would you do differently next time?"] } },
  { id: "revise", name: "Revise", type: "response", title: "Revise", configuration: { prompt: "How would you improve it now?" } },
  { id: "retain", name: "Retain", type: "reflection", title: "Keep this", configuration: { prompts: ["What is worth remembering from this?"] } },
  { id: "final_judgement", name: "Final judgement", type: "response", title: "Final judgement", configuration: { prompt: "What is your final judgement, and why?" } },
];
