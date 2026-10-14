/**
 * AUTHORING VOCABULARY — the words the builder uses for the mission model.
 *
 * One source for field labels, so the generated forms (schema-form.tsx), the
 * validation messages (issue-text.ts) and the plain-language summaries
 * (completion-text.ts) call the same field the same thing. An author who sees
 * "Goes to" in a form must see "Goes to" in the error about it, not `next`.
 *
 * Plain module, no React: imported by server actions and the validator as
 * well as by client components.
 */

export const LABELS: Record<string, string> = {
  next: "Goes to", to: "Goes to", otherwise: "Otherwise goes to", when: "Only when", requires: "Shown only when",
  effects: "Changes to mission state", routes: "Routes (first match wins)", trail: "Mission Trail marker",
  retry: "Retry", timer: "Timed stage", media: "Media", support: "Mission Control support",
  convergeAt: "Branches meet again at", required: "Required on every route", missionControl: "Mission Control (basic)",
  revealedBody: "Revealed content", concealedPrompt: "Before it opens", returnInstruction: "When to come back",
  canonicalTracker: "Tracker values set here", fromInput: "Save the child's own answer",
  relatesTo: "Relates to earlier evidence", storeAs: "Store the result in", availableAfter: "Opens after",
  ageBand: "Age band", maxItems: "Most items", selectExactly: "Choose exactly", inputType: "Answer type",
  screenKey: "Screen", optionId: "Option",
};

/** Fields whose value is another screen's key. */
export const SCREEN_REFS = new Set(["next", "to", "otherwise", "convergeAt", "screenKey", "goto", "unusedFrom", "fromResponse"]);

export const humanise = (k: string) =>
  LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** "Trail entries" → "Trail entry", "Options" → "Option" (labels for one item). */
export const singular = (s: string) => s.replace(/ies$/, "y").replace(/([^s])s$/, "$1");

/** The shared condition language's references, as the condition builder offers them. */
export const REF_KINDS = [
  ["var", "Variable"], ["choice", "Choice made on"], ["multi", "Options picked on"], ["response", "Answer given on"],
  ["visited", "Screen reached"], ["revealed", "Revealed"], ["unlocked", "Unlocked"], ["handoff", "Handoff confirmed"],
  ["event", "Event happened"], ["attempts", "Attempts on"], ["variant", "Variant"], ["elapsed", "Seconds since"],
] as const;

export const OPS = [["eq", "is"], ["neq", "is not"], ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["exists", "exists"], ["not_exists", "does not exist"], ["contains", "contains"], ["in", "is one of"]] as const;

/**
 * A schema path as an author reads it.
 *
 *   ["options", 0, "next"]  → "Option 1 → Goes to"
 *   ["variables", 2, "key"] → "Variable 3 → Key"
 *   []                      → ""
 */
export function describePath(path: readonly PropertyKey[]): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    const nextSeg = path[i + 1];
    if (typeof seg === "number") continue; // folded into the list name below
    const label = humanise(String(seg));
    if (typeof nextSeg === "number") {
      // A list item: "Options" + 0 → "Option 1"; strip any "(…)" qualifier.
      parts.push(`${singular(label.replace(/\s*\(.*\)$/, ""))} ${nextSeg + 1}`);
    } else {
      parts.push(label);
    }
  }
  return parts.join(" → ");
}
