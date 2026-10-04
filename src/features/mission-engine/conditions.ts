import { z } from "zod";
import type { MissionStateData } from "./schemas";
import { readVariable } from "./variables";

/**
 * F2 — THE CONDITION EVALUATOR.
 *
 * One evaluator for every "does the mission react to what the child did"
 * question: routing, reveals, unlocks, gated screens and resources, events,
 * Mission Control support, option availability and completion. Nothing else in
 * the Academy may evaluate a condition on its own — the legacy reveal and
 * completion shapes are translated INTO this form (`fromLegacyReveal`,
 * `fromLegacyCompletion`) rather than kept as parallel logic.
 *
 * Pure and total: it never throws and never touches the network. A malformed,
 * mistyped or impossible comparison evaluates to false; the authoring validator
 * (validator.ts) is where those are reported, before a version can publish.
 */

export const ref = z.union([
  z.object({ var: z.string().min(1) }).strict(),
  z.object({ choice: z.string().min(1) }).strict(),
  z.object({ multi: z.string().min(1) }).strict(),
  z.object({ response: z.string().min(1) }).strict(),
  z.object({ visited: z.string().min(1) }).strict(),
  z.object({ revealed: z.string().min(1) }).strict(),
  z.object({ unlocked: z.string().min(1) }).strict(),
  z.object({ handoff: z.string().min(1) }).strict(),
  z.object({ event: z.string().min(1) }).strict(),
  z.object({ attempts: z.string().min(1) }).strict(),
  z.object({ variant: z.literal(true) }).strict(),
  /** The outcome a graded library screen matched (interactions/). */
  z.object({ outcome: z.string().min(1) }).strict(),
  /** The zone an object sits in on a persistent workspace: "workspace.object". */
  z.object({ placed: z.string().min(1) }).strict(),
  /** Seconds since a server-recorded mark: `start`, `screen:<key>`, `checkpoint:<key>`, `event:<key>`. */
  z.object({ elapsed: z.object({ since: z.string().min(1) }).strict() }).strict(),
]);
export type Ref = z.infer<typeof ref>;

export const compareOps = [
  "eq", "neq", "gt", "gte", "lt", "lte", "exists", "not_exists", "contains", "in",
] as const;
export type CompareOp = (typeof compareOps)[number];

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { always: true }
  | { ref: Ref; op: CompareOp; value?: unknown };

export const condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(condition) }).strict(),
    z.object({ any: z.array(condition) }).strict(),
    z.object({ not: condition }).strict(),
    z.object({ always: z.literal(true) }).strict(),
    z
      .object({ ref, op: z.enum(compareOps), value: z.unknown().optional() })
      .strict(),
  ]),
) as z.ZodType<Condition>;

export type EvalContext = {
  state: MissionStateData;
  /** Server time. Time conditions never trust the browser's clock. */
  now: Date;
};

const MAX_DEPTH = 32;

/** The value a reference points at, or `undefined` when there is none. */
export function resolveRef(r: Ref, ctx: EvalContext): unknown {
  const s = ctx.state;
  if ("var" in r) return readVariable(s, r.var);
  if ("choice" in r) return s.choices[r.choice];
  if ("multi" in r) return s.multiChoices[r.multi];
  if ("response" in r) return s.respondedScreens.includes(r.response) ? true : undefined;
  if ("visited" in r) return s.visitedScreens.includes(r.visited);
  if ("revealed" in r) return s.revealed.includes(r.revealed);
  if ("unlocked" in r) return s.unlocked.includes(r.unlocked);
  if ("handoff" in r) return s.confirmedHandoffs.includes(r.handoff);
  if ("event" in r) return s.firedEvents.includes(r.event);
  if ("outcome" in r) return s.outcomes[r.outcome];
  if ("placed" in r) {
    const [ws, obj] = r.placed.split(".");
    const board = s.workspaces[ws] as { placements?: Record<string, string> } | undefined;
    return board?.placements?.[obj];
  }
  if ("attempts" in r) return s.attempts[r.attempts] ?? 0;
  if ("variant" in r) return s.variant ?? undefined;
  if ("elapsed" in r) {
    const at = s.marks[r.elapsed.since];
    if (!at) return undefined;
    const t = Date.parse(at);
    if (Number.isNaN(t)) return undefined;
    return Math.max(0, Math.floor((ctx.now.getTime() - t) / 1000));
  }
  return undefined;
}

function present(v: unknown): boolean {
  if (v === undefined || v === null || v === false || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

function same(a: unknown, b: unknown): boolean {
  if (typeof a !== typeof b) return false;
  if (a === null || typeof a !== "object") return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function compare(op: CompareOp, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case "exists":
      return present(actual);
    case "not_exists":
      return !present(actual);
    case "eq":
      return actual !== undefined && same(actual, expected);
    case "neq":
      return !(actual !== undefined && same(actual, expected));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (typeof actual !== "number" || typeof expected !== "number") return false;
      if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
      return op === "gt" ? actual > expected
        : op === "gte" ? actual >= expected
        : op === "lt" ? actual < expected
        : actual <= expected;
    }
    case "contains":
      if (Array.isArray(actual)) return actual.some((x) => same(x, expected));
      if (typeof actual === "string" && typeof expected === "string") return actual.includes(expected);
      return false;
    case "in":
      return Array.isArray(expected) && actual !== undefined && expected.some((x) => same(x, actual));
  }
}

class TooDeep extends Error {}

function evalNode(c: unknown, ctx: EvalContext, depth: number): boolean {
  // Exceeding the depth fails the WHOLE evaluation — returning false for the
  // subtree would let an odd number of enclosing `not`s turn it into true.
  if (depth > MAX_DEPTH) throw new TooDeep();
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  const node = c as Record<string, unknown>;
  if (Array.isArray(node.all)) return node.all.every((x) => evalNode(x, ctx, depth + 1));
  if (Array.isArray(node.any)) return node.any.some((x) => evalNode(x, ctx, depth + 1));
  if ("not" in node) return !evalNode(node.not, ctx, depth + 1);
  if (node.always === true) return true;
  if ("ref" in node && typeof node.op === "string") {
    const parsed = ref.safeParse(node.ref);
    if (!parsed.success || !(compareOps as readonly string[]).includes(node.op)) return false;
    return compare(node.op as CompareOp, resolveRef(parsed.data, ctx), node.value);
  }
  return false;
}

export function evaluate(c: unknown, ctx: EvalContext): boolean {
  try {
    return evalNode(c, ctx, 0);
  } catch (e) {
    if (e instanceof TooDeep) return false;
    throw e;
  }
}

/** Every reference a condition reads — for the validator and the state inspector. */
export function conditionRefs(c: unknown, out: Ref[] = [], depth = 0): Ref[] {
  if (depth > MAX_DEPTH || !c || typeof c !== "object") return out;
  const node = c as Record<string, unknown>;
  if (Array.isArray(node.all)) node.all.forEach((x) => conditionRefs(x, out, depth + 1));
  else if (Array.isArray(node.any)) node.any.forEach((x) => conditionRefs(x, out, depth + 1));
  else if ("not" in node) conditionRefs(node.not, out, depth + 1);
  else if ("ref" in node) {
    const parsed = ref.safeParse(node.ref);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

// ------------------------------------------------------------ legacy shapes --

/** Reveal conditions as Six Names and earlier missions store them. */
export function fromLegacyReveal(c: unknown, screenKey: string): Condition {
  const node = (c ?? {}) as Record<string, unknown>;
  if (node.type === "choice_equals") {
    return { ref: { choice: String(node.screenKey) }, op: "eq", value: node.optionId };
  }
  if (node.type === "response_exists") {
    // Legacy semantics, kept exactly: the reveal opened once the screen was
    // VISITED (navigation.ts before the foundation), not once a response saved.
    return { ref: { visited: String(node.screenKey) }, op: "exists" };
  }
  if (node.type === "child_action") {
    // Unlocked by the child's own reveal action on this screen.
    return { ref: { revealed: screenKey }, op: "exists" };
  }
  // A new-style condition stored directly.
  return condition.safeParse(c).success ? (c as Condition) : { not: { always: true } };
}

/** The pre-foundation completion rule, translated (D-17 rules stay pinned). */
export function fromLegacyCompletion(rule: unknown): Condition | null {
  const r = (rule ?? null) as Record<string, unknown> | null;
  if (!r) return null;
  if (r.type === "screen_reached") {
    return { ref: { visited: String(r.screenKey) }, op: "exists" };
  }
  if (r.type === "condition") {
    return condition.safeParse(r.when).success ? (r.when as Condition) : null;
  }
  if (r.type === "conditions" && Array.isArray(r.conditions)) {
    return {
      all: r.conditions.map((c: Record<string, unknown>): Condition => {
        const key = String(c.screenKey);
        switch (c.kind) {
          case "response_exists": return { ref: { response: key }, op: "exists" };
          case "choice_equals": return { ref: { choice: key }, op: "eq", value: c.optionId };
          case "choice_exists": return { ref: { choice: key }, op: "exists" };
          case "screen_visited": return { ref: { visited: key }, op: "exists" };
          default: return { not: { always: true } };
        }
      }),
    };
  }
  return null;
}
