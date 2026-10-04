import { z } from "zod";
import type { MissionStateData } from "./schemas";

/**
 * F1 — MISSION VARIABLES.
 *
 * Declared per mission version in the definition (definition.ts), stored in
 * `state.variables`, changed only by declared effects, and read only through
 * `readVariable` — so conditions, projection, Mission Control and the state
 * inspector all see the same value.
 *
 * SIX NAMES COMPATIBILITY. Six Names v2 predates declared variables and keeps
 * its canonical tracker in `custom.tracker` (applyCanonicalTracker). Its
 * published configuration is immutable and its runs are pinned (D-17), so that
 * storage is left exactly as it is. The variable model exposes it read-only as
 * `tracker.<dimension>`, which is what lets new logic and the inspector treat
 * the Six Names tracker as ordinary mission state without migrating a byte.
 */

export const variableTypes = ["string", "number", "boolean", "enum", "counter", "resource", "list"] as const;
export type VariableType = (typeof variableTypes)[number];

export const effectOps = ["set", "increment", "decrement", "toggle", "add", "remove", "append", "unlock", "mark"] as const;
export type EffectOp = (typeof effectOps)[number];

/** Which operations make sense for each type. Declarations may narrow this. */
export const opsByType: Record<VariableType, EffectOp[]> = {
  string: ["set"],
  number: ["set", "increment", "decrement"],
  boolean: ["set", "toggle"],
  enum: ["set"],
  counter: ["increment", "decrement", "set"],
  resource: ["set", "increment", "decrement"],
  list: ["set", "add", "remove", "append"],
};

const KEY = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

export const variableDeclaration = z
  .object({
    key: z.string().regex(KEY, "Use lower case, digits, _ and dots, e.g. clues_found"),
    type: z.enum(variableTypes),
    label: z.string().optional().describe("Shown to authors; to children only if visible"),
    default: z.unknown().optional(),
    /** Visible values may reach the child's screen; hidden ones never leave the server. */
    visibility: z.enum(["visible", "hidden"]).default("hidden"),
    /** `run` lasts the whole run; `screen` is cleared whenever the child moves on. */
    persist: z.enum(["run", "screen"]).default("run"),
    operations: z.array(z.enum(effectOps)).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    values: z.array(z.string().min(1)).optional().describe("Allowed values for an enum"),
    maxItems: z.number().int().positive().optional(),
  })
  .strict();
export type VariableDeclaration = z.infer<typeof variableDeclaration>;

export const effect = z.union([
  z.object({ op: z.literal("set"), var: z.string().min(1), value: z.unknown() }).strict(),
  z.object({ op: z.literal("increment"), var: z.string().min(1), by: z.number().optional() }).strict(),
  z.object({ op: z.literal("decrement"), var: z.string().min(1), by: z.number().optional() }).strict(),
  z.object({ op: z.literal("toggle"), var: z.string().min(1) }).strict(),
  z.object({ op: z.literal("add"), var: z.string().min(1), value: z.unknown() }).strict(),
  z.object({ op: z.literal("remove"), var: z.string().min(1), value: z.unknown() }).strict(),
  z.object({ op: z.literal("append"), var: z.string().min(1), value: z.unknown() }).strict(),
  z.object({ op: z.literal("unlock"), key: z.string().min(1) }).strict(),
  z.object({ op: z.literal("mark"), key: z.string().min(1) }).strict(),
]);
export type Effect = z.infer<typeof effect>;

export function defaultValue(d: VariableDeclaration): unknown {
  if (d.default !== undefined) return d.default;
  switch (d.type) {
    case "string": return "";
    case "number": return 0;
    case "boolean": return false;
    case "enum": return d.values?.[0] ?? null;
    case "counter": return d.min ?? 0;
    case "resource": return d.min ?? 0;
    case "list": return [];
  }
}

/** Read a variable. `tracker.<dim>` falls back to the Six Names canonical tracker. */
export function readVariable(state: MissionStateData, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(state.variables, key)) return state.variables[key];
  if (key.startsWith("tracker.")) {
    const tracker = state.custom.tracker as Record<string, unknown> | undefined;
    return tracker?.[key.slice("tracker.".length)];
  }
  return undefined;
}

function clamp(d: VariableDeclaration, n: number): number {
  let v = n;
  if (typeof d.min === "number") v = Math.max(d.min, v);
  if (typeof d.max === "number") v = Math.min(d.max, v);
  return v;
}

/** Is `value` acceptable for this declaration? Used by `set` and the validator. */
export function acceptsValue(d: VariableDeclaration, value: unknown): boolean {
  switch (d.type) {
    case "string": return typeof value === "string";
    case "number":
    case "counter":
    case "resource": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "enum": return typeof value === "string" && (d.values ?? []).includes(value);
    case "list": return Array.isArray(value);
  }
}

export type EffectContext = {
  declarations: VariableDeclaration[];
  now: Date;
};

/**
 * Apply effects in order. Unknown variables, disallowed operations and values
 * of the wrong type are ignored at runtime — never thrown — because a learner
 * must not be stranded by an authoring mistake. The validator refuses to
 * publish a version that contains any of them.
 */
export function applyEffects(
  state: MissionStateData,
  effects: readonly unknown[] | undefined,
  ctx: EffectContext,
): MissionStateData {
  if (!effects?.length) return state;
  const byKey = new Map(ctx.declarations.map((d) => [d.key, d]));
  let s = state;
  for (const raw of effects) {
    const parsed = effect.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (e.op === "unlock") {
      if (!s.unlocked.includes(e.key)) s = { ...s, unlocked: [...s.unlocked, e.key] };
      continue;
    }
    if (e.op === "mark") {
      s = { ...s, marks: { ...s.marks, [e.key]: ctx.now.toISOString() } };
      continue;
    }
    const d = byKey.get(e.var);
    if (!d) continue;
    const allowed = d.operations ?? opsByType[d.type];
    if (!allowed.includes(e.op)) continue;
    const current = Object.prototype.hasOwnProperty.call(s.variables, d.key)
      ? s.variables[d.key]
      : defaultValue(d);
    let next: unknown = current;
    switch (e.op) {
      case "set":
        if (!acceptsValue(d, e.value)) continue;
        next = typeof e.value === "number" ? clamp(d, e.value) : e.value;
        break;
      case "increment":
      case "decrement": {
        if (typeof current !== "number") continue;
        const by = e.by ?? 1;
        next = clamp(d, current + (e.op === "increment" ? by : -by));
        break;
      }
      case "toggle":
        if (typeof current !== "boolean") continue;
        next = !current;
        break;
      case "add":
      case "append": {
        const list = Array.isArray(current) ? current : [];
        if (e.op === "add" && list.some((x) => JSON.stringify(x) === JSON.stringify(e.value))) continue;
        if (d.maxItems && list.length >= d.maxItems) continue;
        next = [...list, e.value];
        break;
      }
      case "remove": {
        const list = Array.isArray(current) ? current : [];
        next = list.filter((x) => JSON.stringify(x) !== JSON.stringify(e.value));
        break;
      }
    }
    s = { ...s, variables: { ...s.variables, [d.key]: next } };
  }
  return s;
}

/** Defaults for every declared variable, for a new run. */
export function initialVariables(declarations: VariableDeclaration[]): Record<string, unknown> {
  return Object.fromEntries(declarations.map((d) => [d.key, defaultValue(d)]));
}

/** `persist: "screen"` variables return to their default when the child moves on. */
export function clearScreenScoped(state: MissionStateData, declarations: VariableDeclaration[]): MissionStateData {
  const scoped = declarations.filter((d) => d.persist === "screen");
  if (!scoped.length) return state;
  const variables = { ...state.variables };
  for (const d of scoped) variables[d.key] = defaultValue(d);
  return { ...state, variables };
}

/**
 * Split for storage: hidden values and the seed go to the private table, which
 * no client can read (D-80); everything else to the family-readable state.
 */
export function splitForStorage(
  state: MissionStateData,
  declarations: VariableDeclaration[],
  privateExtras: Record<string, unknown> = {},
): { publicState: MissionStateData; privateData: Record<string, unknown> } {
  const hiddenKeys = new Set(declarations.filter((d) => d.visibility === "hidden").map((d) => d.key));
  const visible: Record<string, unknown> = {};
  const hidden: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state.variables)) (hiddenKeys.has(k) ? hidden : visible)[k] = v;
  return {
    publicState: { ...state, variables: visible, seed: null, firedEvents: [], variant: null },
    privateData: { ...privateExtras, hidden, seed: state.seed, firedEvents: state.firedEvents, variant: state.variant },
  };
}

/** The inverse of `splitForStorage`. */
export function mergeFromStorage(publicState: MissionStateData, privateData: unknown): MissionStateData {
  const p = (privateData ?? {}) as Record<string, unknown>;
  const hidden = (p.hidden ?? {}) as Record<string, unknown>;
  return {
    ...publicState,
    variables: { ...publicState.variables, ...hidden },
    seed: typeof p.seed === "number" ? p.seed : publicState.seed,
    firedEvents: Array.isArray(p.firedEvents) ? (p.firedEvents as string[]) : publicState.firedEvents,
    variant: typeof p.variant === "string" ? p.variant : publicState.variant,
  };
}
