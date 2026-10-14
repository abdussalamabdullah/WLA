import { OPS, REF_KINDS } from "@/features/mission-engine/field-labels";

/**
 * COMPLETION IN PLAIN LANGUAGE.
 *
 * A version has two places that can say when a mission is complete, and the
 * runtime's order between them is fixed (runtime.ts `completionCondition`):
 *
 *   1. the mission logic's "Completion condition" (definition.completion),
 *      when it is set, decides — and the version's rule is NOT consulted;
 *   2. otherwise the version's completion rule (`mission_versions.completion_rule`).
 *
 * Both are kept (D-115). This module only DESCRIBES them, so the builder can
 * say which one is in force; it never rewrites either.
 */

type Titles = ReadonlyMap<string, string>;

const quote = (key: string, titles: Titles) => `“${titles.get(key) || key}”`;
const refLabel = new Map<string, string>(REF_KINDS as unknown as [string, string][]);
const opLabel = new Map<string, string>(OPS as unknown as [string, string][]);

/** One condition from the shared condition language, as a phrase. */
export function describeCondition(c: unknown, titles: Titles = new Map(), depth = 0): string {
  const n = (c ?? {}) as Record<string, unknown>;
  if (depth > 4) return "a nested condition";
  if (n.always === true) return "straight away";
  if (Array.isArray(n.all)) return n.all.length ? `all of: ${n.all.map((x) => describeCondition(x, titles, depth + 1)).join("; ")}` : "straight away";
  if (Array.isArray(n.any)) return n.any.length ? `any of: ${n.any.map((x) => describeCondition(x, titles, depth + 1)).join("; ")}` : "never";
  if ("not" in n) {
    const inner = n.not as Record<string, unknown> | undefined;
    if (inner?.always === true) return "never";
    return `not (${describeCondition(inner, titles, depth + 1)})`;
  }
  if (n.ref && typeof n.ref === "object") {
    const ref = n.ref as Record<string, unknown>;
    const kind = Object.keys(ref)[0] ?? "";
    const target = typeof ref[kind] === "string" ? String(ref[kind]) : "";
    const op = String(n.op ?? "eq");
    const exists = op === "exists";
    if (kind === "visited" && exists) return `the child reaches ${quote(target, titles)}`;
    if (kind === "response" && exists) return `the child answers ${quote(target, titles)}`;
    if (kind === "choice" && exists) return `the child makes a choice on ${quote(target, titles)}`;
    if (kind === "choice" && op === "eq") return `the child chooses “${String(n.value)}” on ${quote(target, titles)}`;
    if (kind === "handoff" && exists) return `the child confirms the handoff on ${quote(target, titles)}`;
    if (kind === "revealed" && exists) return `${quote(target, titles)} has been revealed`;
    if (kind === "unlocked" && exists) return `“${target}” is unlocked`;
    if (kind === "event" && exists) return `the event “${target}” has happened`;
    const what = `${(refLabel.get(kind) ?? kind).toLowerCase()}${target ? ` ${["choice", "multi", "response", "visited", "revealed", "handoff", "attempts"].includes(kind) ? quote(target, titles) : `“${target}”`}` : ""}`;
    const test = opLabel.get(op) ?? op;
    return op === "exists" || op === "not_exists" ? `${what} ${test}` : `${what} ${test} ${Array.isArray(n.value) ? n.value.join(", ") : String(n.value)}`;
  }
  return "a custom condition";
}

/** The version's own rule (the pre-foundation shapes and the condition form). */
export function describeRule(rule: unknown, titles: Titles = new Map()): string | null {
  const r = (rule ?? null) as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  if (r.type === "screen_reached") return typeof r.screenKey === "string" && r.screenKey ? `the child reaches ${quote(r.screenKey, titles)}` : null;
  if (r.type === "condition") return describeCondition(r.when, titles);
  if (r.type === "conditions" && Array.isArray(r.conditions)) {
    const parts = r.conditions.map((c: Record<string, unknown>) => {
      const key = String(c.screenKey ?? "");
      switch (c.kind) {
        case "response_exists": return `the child answers ${quote(key, titles)}`;
        case "choice_equals": return `the child chooses “${String(c.optionId)}” on ${quote(key, titles)}`;
        case "choice_exists": return `the child makes a choice on ${quote(key, titles)}`;
        case "screen_visited": return `the child reaches ${quote(key, titles)}`;
        default: return "an unrecognised condition";
      }
    });
    return parts.length ? `all of: ${parts.join("; ")}` : null;
  }
  return null;
}

/** The ordinary rule the basic form can show and save, if `rule` is one. */
export function basicRuleScreen(rule: unknown): string | null {
  const r = (rule ?? null) as Record<string, unknown> | null;
  return r && r.type === "screen_reached" && typeof r.screenKey === "string" ? r.screenKey : null;
}

export type EffectiveCompletion = {
  /** Which mechanism the runtime will use. */
  source: "definition" | "rule" | "none";
  /** "Complete when …" — what is actually in force. */
  inEffect: string;
  /** The version's rule, described, even when it is not the one in force. */
  ruleText: string | null;
};

export function effectiveCompletion(input: {
  rule: unknown;
  definitionCompletion: unknown;
  titles?: Titles;
}): EffectiveCompletion {
  const titles = input.titles ?? new Map();
  const ruleText = describeRule(input.rule, titles);
  if (input.definitionCompletion !== undefined && input.definitionCompletion !== null) {
    return {
      source: "definition",
      inEffect: `Complete when ${describeCondition(input.definitionCompletion, titles)} — set by the completion condition in Mission logic.`,
      ruleText,
    };
  }
  if (ruleText) return { source: "rule", inEffect: `Complete when ${ruleText}.`, ruleText };
  return { source: "none", inEffect: "No completion rule is set yet, so the Academy can't tell when the mission is finished.", ruleText: null };
}
