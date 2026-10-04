import { z } from "zod";
import { condition, type Condition } from "./conditions";
import { effect, variableDeclaration, type VariableDeclaration } from "./variables";
import type { CompletionRule } from "./schemas";
import { workspaceDef } from "./interactions/schemas";
import type { MissionScreen } from "./navigation";

/**
 * F8 — THE CANONICAL MISSION MODEL.
 *
 *   MissionModel = MissionDefinition (one per version, mission_versions.definition)
 *                + MissionScreen[]   (mission_screens rows at that version)
 *                + completion rule   (pinned on the run, D-17)
 *
 * ONE model, consumed unchanged by the builder, the validator (validator.ts),
 * Learner Preview and the runtime (runtime.ts). The runtime loads it server-side
 * through the service-role store (D-80) and sends the browser only a projection
 * of the current screen (projection.ts). There is no separate "authoring
 * format": what an author saves is what a child plays.
 *
 * Versioned with the mission version: a definition is immutable once its
 * version is published (guard_mission_version_row), copied by
 * create_mission_version, and `schemaVersion` lets the shape evolve.
 */

const key = z.string().regex(/^[a-z][a-z0-9_]*$/, "Lower case, digits and _ only");
const screenKeyRef = z.string().min(1);

export const unlockDef = z
  .object({
    key,
    label: z.string().optional(),
    /** Gained the first time this holds after an interaction. Never lost. */
    when: condition,
  })
  .strict();

export const eventDef = z
  .object({
    key,
    label: z.string().optional(),
    /** Changing-condition event: fires the first time this holds. */
    when: condition,
    /** What changes: information, resources, rules, constraints, routes (via variables/unlocks). */
    effects: z.array(effect).default([]),
    /** Optionally interrupt the route to announce the change. */
    goto: screenKeyRef.optional(),
  })
  .strict();

export const variantDef = z
  .object({
    id: key,
    label: z.string().min(1),
    /** Relative weight for selection. 0 = never chosen automatically. */
    weight: z.number().nonnegative().default(1),
    /** Approved age-band variants: chosen only for children in range (OPEN-05: age is metadata). */
    ageBand: z.object({ min: z.number().int(), max: z.number().int() }).strict().optional(),
    /** Starting values for declared variables (clues, numbers, resources, constraints, scenario). */
    values: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const poolDef = z
  .object({
    key,
    /** Approved content items. Only ids are stored; labels live here. */
    items: z
      .array(
        z
          .object({
            id: key,
            label: z.string().optional(),
            weight: z.number().nonnegative().default(1),
            /** Excluded unless this holds when the draw happens. */
            when: condition.optional(),
          })
          .strict(),
      )
      .min(1),
    pick: z.number().int().positive().default(1),
    /** A declared list (or string for pick 1) variable that receives the drawn ids. */
    storeAs: z.string().min(1),
  })
  .strict();

export const checkpointDef = z
  .object({
    key,
    screenKey: screenKeyRef,
    label: z.string().min(1),
    /** A real-world interval: the screen opens this many seconds after `since`. */
    availableAfter: z
      .object({ since: z.string().min(1), seconds: z.number().int().positive() })
      .strict()
      .optional(),
  })
  .strict();

export const missionDefinition = z
  .object({
    schemaVersion: z.literal(1).default(1),
    variables: z.array(variableDeclaration).default([]),
    unlocks: z.array(unlockDef).default([]),
    events: z.array(eventDef).default([]),
    variants: z.array(variantDef).default([]),
    pools: z.array(poolDef).default([]),
    checkpoints: z.array(checkpointDef).default([]),
    /** Persistent interactive workspaces (Plan §4), shown by `workspace` screens. */
    workspaces: z.array(workspaceDef).default([]),
    /** Mission-level completion; overrides the version's completion rule when set. */
    completion: condition.optional(),
    /** Named stages for drop-off reporting: screen key → stage label. */
    stages: z.record(z.string(), z.string()).default({}),
  })
  .strip();
export type MissionDefinition = z.infer<typeof missionDefinition>;

export const emptyDefinition: MissionDefinition = missionDefinition.parse({});

/** Parse a stored definition; a missing or malformed one is the empty definition. */
export function parseDefinition(raw: unknown): MissionDefinition {
  const r = missionDefinition.safeParse(raw ?? {});
  return r.success ? r.data : emptyDefinition;
}

// --------------------------------------------- common screen configuration --

/** A Mission Trail marker on a screen (F6). */
export const trailMarker = z
  .object({
    key,
    title: z.string().min(1),
    /** `digital`: the Academy stores it. `physical`: the child keeps it; recorded, never stored. */
    type: z.enum(["digital", "physical"]),
    /** Physical: what to keep. Digital: used when the input itself is not the evidence. */
    description: z.string().optional(),
    /** Store the child's own input on this screen as the evidence text. */
    fromInput: z.boolean().default(false),
    relatesTo: z
      .object({
        key,
        relation: z.enum(["revision_of", "changed_plan_of", "result_of", "later_judgement_of", "after_of"]),
      })
      .strict()
      .optional(),
  })
  .strict();
export type TrailMarker = z.infer<typeof trailMarker>;

/** Mission Control v2 item (§8): levelled, state-aware, kinds. */
export const supportItem = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    /** 1 = smallest useful nudge; shown first. */
    level: z.number().int().min(1).max(3).default(1),
    kind: z.enum(["nudge", "check", "materials", "reword", "recovery"]).default("nudge"),
    /** Only offered when this holds (state-aware support). */
    when: condition.optional(),
    /** For `materials`: a Mission Kit resource title to point at. */
    resource: z.string().optional(),
  })
  .strict();

/**
 * Fields any screen type may carry, beside its type-specific configuration.
 * Server-only fields (routes, requires, effects, trail) are removed by the
 * projection before the browser sees the screen.
 */
export const commonScreenConfig = z
  .object({
    /** Ordered conditional routing; first match wins; falls back to option/next/sequence. */
    routes: z.array(z.object({ when: condition, to: screenKeyRef }).strict()).optional(),
    /** Gated content: this screen is skipped while the condition does not hold. */
    requires: condition.optional(),
    /** Where to go instead while `requires` does not hold (defaults to the next screen by sequence). */
    otherwise: screenKeyRef.optional(),
    /** Applied on a successful interaction with this screen. */
    effects: z.array(effect).optional(),
    trail: trailMarker.optional(),
    retry: z.object({ allowed: z.boolean(), maxAttempts: z.number().int().positive().optional() }).strict().optional(),
    timer: z
      .object({
        seconds: z.number().int().positive(),
        visible: z.boolean().default(true),
        onExpire: z.enum(["advance", "stay"]).default("advance"),
      })
      .strict()
      .optional(),
    /** Media blocks by asset key (F7). */
    media: z
      .array(
        z
          .object({
            asset: z.string().min(1),
            when: condition.optional(),
            caption: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    support: z.array(supportItem).optional(),
    /** Every completing path must pass through this screen (validator: bypassable_required_content). */
    required: z.boolean().optional(),
    /** For a decision: every branch from here must meet again at this screen (validator: missing_convergence). */
    convergeAt: screenKeyRef.optional(),
    /** Interpolation and the inspector read these; authors never need to. */
  })
  .passthrough();
export type CommonScreenConfig = z.infer<typeof commonScreenConfig>;

export function commonOf(screen: MissionScreen): CommonScreenConfig {
  const r = commonScreenConfig.safeParse(screen.configuration ?? {});
  return r.success ? r.data : {};
}

// ------------------------------------------------------------------ model --

export type MissionModel = {
  definition: MissionDefinition;
  /** Ordered by sequence. */
  screens: MissionScreen[];
  /** The run's pinned rule (D-17), or the version's. */
  completionRule: CompletionRule | null;
};

export function buildModel(input: {
  definition: unknown;
  screens: MissionScreen[];
  completionRule: unknown;
}): MissionModel {
  return {
    definition: parseDefinition(input.definition),
    screens: [...input.screens].sort((a, b) => a.sequence - b.sequence),
    completionRule: (input.completionRule ?? null) as CompletionRule | null,
  };
}

export function screenByKey(model: MissionModel, k: string | null | undefined): MissionScreen | null {
  if (!k) return null;
  return model.screens.find((s) => s.screenKey === k) ?? null;
}

export function nextBySequence(model: MissionModel, k: string): string | null {
  const i = model.screens.findIndex((s) => s.screenKey === k);
  return i >= 0 && i + 1 < model.screens.length ? model.screens[i + 1].screenKey : null;
}

export function declarations(model: MissionModel): VariableDeclaration[] {
  return model.definition.variables;
}

export type { Condition };
