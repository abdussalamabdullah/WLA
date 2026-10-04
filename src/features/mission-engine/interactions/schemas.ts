import { z } from "zod";
import { condition } from "../conditions";
import { effect } from "../variables";

/**
 * THE INTERACTION LIBRARY — configuration schemas (Enhancement Plan §4).
 *
 * The plan lists twenty-eight interaction forms. Most are modes of one
 * underlying capability — sorting, sequencing, reordering, ranking and
 * drag-and-drop are all "arrange these items" — so the library is fourteen
 * general screen types, each with modes, rather than twenty-eight near-copies
 * (D-86). Every type is built once and configured per mission (Tech Spec §62).
 *
 * GRADED INPUT. Types that can check an answer (codes, numbers, sequences,
 * patterns...) share one shape: `outcomes`, each with a type-specific `match`,
 * plus `onNoMatch`. Both are SERVER-ONLY — the projection removes them — so an
 * answer is never in the page. A matched outcome's id is recorded in
 * `state.outcomes[screenKey]`, which conditions read as `{ outcome: key }`;
 * its `next` and `effects` route and change state. Nothing is ever labelled
 * right or wrong to the child: an outcome is just which way the mission goes.
 *
 * A type with no outcomes is open-ended: any valid input is recorded and the
 * mission continues (Plan §5: "confirm completion without judging open-ended
 * physical work").
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i, "Letters, digits, - and _ only");
const missionControl = z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).default([]);
const next = z.string().min(1).optional();

/** Common fields every library screen carries. */
const base = {
  prompt: z.string().min(1),
  instruction: z.string().optional(),
  missionControl,
  actionLabel: z.string().optional(),
  next,
  /** Stores the submitted value in a declared variable (F1). */
  storeAs: z.string().min(1).optional(),
};

function outcomes<M extends z.ZodTypeAny>(match: M) {
  return z
    .array(
      z.object({
        id,
        match,
        next,
        effects: z.array(effect).default([]),
      }),
    )
    .default([]);
}

/** What happens when graded input matches no outcome. */
export const onNoMatch = z
  .object({
    /** `retry`: stay and say so (counts an attempt). `continue`: record and move on. */
    mode: z.enum(["retry", "continue"]).default("retry"),
    /** Calm, non-judging copy. */
    message: z.string().default("That doesn't open anything yet. Check and try again."),
    next,
    effects: z.array(effect).default([]),
    /** After this many attempts, continue to `fallbackNext` instead (interaction recovery, §8). */
    fallbackAfter: z.number().int().positive().optional(),
    fallbackNext: next,
  })
  .default({ mode: "retry", message: "That doesn't open anything yet. Check and try again.", effects: [] });

const item = z.object({ id, label: z.string().min(1), description: z.string().optional() });
const image = z.object({ src: z.string().min(1), alt: z.string().min(1) });

// ------------------------------------------------------------- entry ----

export const numericEntryConfig = z.object({
  ...base,
  label: z.string().default("Your number"),
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  /** Decimal places allowed (0 = whole numbers). */
  decimals: z.number().int().min(0).max(4).default(0),
  outcomes: outcomes(
    z.object({
      equals: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      tolerance: z.number().nonnegative().default(0),
    }),
  ),
  onNoMatch,
});

/** Codes, words, phrases, passphrases and cipher answers (Plan §4, §5). */
export const codeEntryConfig = z.object({
  ...base,
  mode: z.enum(["code", "word", "phrase", "passphrase", "cipher"]).default("code"),
  label: z.string().default("Enter it here"),
  /** Shown on screen: e.g. "Use the cipher wheel from your Mission Kit." */
  hint: z.string().optional(),
  inputMode: z.enum(["text", "numeric"]).default("text"),
  maxLength: z.number().int().positive().max(200).default(40),
  /** Comparison ignores case, spaces and punctuation unless switched off. */
  normalise: z
    .object({ case: z.boolean().default(true), spaces: z.boolean().default(true), punctuation: z.boolean().default(true) })
    .default({ case: true, spaces: true, punctuation: true }),
  outcomes: outcomes(z.object({ values: z.array(z.string().min(1)).min(1) })),
  onNoMatch,
});

export const tokenSequenceConfig = z.object({
  ...base,
  tokens: z.array(z.object({ id, label: z.string().min(1), symbol: z.string().optional() })).min(2),
  length: z.number().int().min(1).max(12),
  allowRepeats: z.boolean().default(true),
  outcomes: outcomes(z.object({ sequences: z.array(z.array(z.string())).min(1) })),
  onNoMatch,
});

// ----------------------------------------------------------- arrange ----

/** Sorting, sequencing, reordering, ranking, drag-and-drop. */
export const arrangeConfig = z.object({
  ...base,
  mode: z.enum(["sort", "sequence", "rank"]).default("sequence"),
  items: z.array(item).min(2).max(24),
  /** `sort` only: the groups items go into. */
  groups: z.array(item).default([]),
  /** Every item must be placed before continuing. */
  requireAll: z.boolean().default(true),
  /** Labels for the ends of a ranking, e.g. "Most important" / "Least important". */
  ends: z.tuple([z.string(), z.string()]).optional(),
  outcomes: outcomes(
    z.object({
      order: z.array(z.string()).optional(),
      groups: z.record(z.string(), z.string()).optional(),
    }),
  ),
  onNoMatch,
});

export const matchingConfig = z.object({
  ...base,
  left: z.array(item).min(2).max(16),
  right: z.array(item).min(2).max(16),
  /** Each right-hand item can be used once. */
  oneToOne: z.boolean().default(true),
  requireAll: z.boolean().default(true),
  outcomes: outcomes(z.object({ pairs: z.record(z.string(), z.string()) })),
  onNoMatch,
});

// ---------------------------------------------------- quantities ----

const control = z.object({
  id,
  label: z.string().min(1),
  min: z.number().default(0),
  max: z.number().default(10),
  step: z.number().positive().default(1),
  default: z.number().optional(),
  unit: z.string().optional(),
  /** Labels for the two ends, so a value is never carried by position alone. */
  ends: z.tuple([z.string(), z.string()]).optional(),
  storeAs: z.string().min(1).optional(),
});

/** Sliders, weighting and resource allocation. */
export const allocateConfig = z.object({
  ...base,
  mode: z.enum(["sliders", "weighting", "allocation"]).default("sliders"),
  controls: z.array(control).min(1).max(8),
  /** `allocation`: the amount to share out; `weighting`: what the weights add up to. */
  total: z.number().positive().optional(),
  /** Must the whole total be used? */
  exact: z.boolean().default(false),
  totalLabel: z.string().optional(),
  outcomes: outcomes(z.object({ ranges: z.record(z.string(), z.object({ min: z.number().optional(), max: z.number().optional() })) })),
  onNoMatch,
});

/** Choose what to carry: the selection persists in a list variable (`storeAs`). */
export const inventoryConfig = z.object({
  ...base,
  items: z.array(item.extend({ when: condition.optional() })).min(1).max(24),
  min: z.number().int().min(0).default(1),
  max: z.number().int().positive().default(3),
  /** Items already carried (from `storeAs`) start selected. */
  keepPrevious: z.boolean().default(true),
});

// ---------------------------------------------------- judgement ----

/** Side-by-side comparison and decision matrices. */
export const compareConfig = z.object({
  ...base,
  mode: z.enum(["comparison", "matrix"]).default("comparison"),
  options: z.array(item.extend({ next, effects: z.array(effect).default([]) })).min(2).max(4),
  criteria: z.array(item).min(1).max(8),
  /** `comparison`: what each option shows for each criterion — key "option.criterion". */
  cells: z.record(z.string(), z.string()).default({}),
  /** `matrix`: the child rates each cell on these labels (never numbers alone). */
  scale: z.array(z.string().min(1)).default([]),
  /** Ask the child to choose one option at the end. */
  pick: z.boolean().default(true),
  pickPrompt: z.string().optional(),
});

// ------------------------------------------------------- visual ----

/** Image hotspots and region annotation. */
export const hotspotConfig = z.object({
  ...base,
  mode: z.enum(["find", "annotate"]).default("find"),
  image,
  /** Percent of the image. Every region is also a named button, so nothing needs precise pointing. */
  regions: z
    .array(z.object({ id, label: z.string().min(1), x: z.number().min(0).max(100), y: z.number().min(0).max(100), w: z.number().min(1).max(100), h: z.number().min(1).max(100) }))
    .min(1)
    .max(30),
  minSelect: z.number().int().min(0).default(1),
  maxSelect: z.number().int().positive().default(1),
  noteMaxLength: z.number().int().positive().max(500).default(200),
  outcomes: outcomes(z.object({ regions: z.array(z.string()).min(1) })),
  onNoMatch,
});

/** Simple drawing. Nothing is stored unless `store` is set (Brief §46). */
export const sketchConfig = z.object({
  ...base,
  /** Offered beside the canvas: the same thinking on paper. */
  paperAlternative: z.string().default("Prefer paper? Draw it on paper and tap Done."),
  store: z.boolean().default(false),
  maxStrokes: z.number().int().positive().max(200).default(80),
});

/** Maps, route building, and node-and-connection building. */
export const mapConfig = z.object({
  ...base,
  mode: z.enum(["route", "network"]).default("route"),
  background: image.optional(),
  nodes: z.array(z.object({ id, label: z.string().min(1), x: z.number().min(0).max(100), y: z.number().min(0).max(100) })).min(2).max(30),
  /** `route`: the links a route may follow (undirected). */
  edges: z.array(z.tuple([z.string(), z.string()])).default([]),
  start: z.string().optional(),
  end: z.string().optional(),
  maxSteps: z.number().int().positive().max(40).default(20),
  /** `network`: how many links the child may make. */
  maxLinks: z.number().int().positive().max(60).default(20),
  outcomes: outcomes(
    z.object({
      path: z.array(z.string()).optional(),
      /** Route passes through all of these (any order). */
      visits: z.array(z.string()).optional(),
      links: z.array(z.tuple([z.string(), z.string()])).optional(),
    }),
  ),
  onNoMatch,
});

export const patternGridConfig = z.object({
  ...base,
  rows: z.number().int().min(1).max(10),
  cols: z.number().int().min(1).max(10),
  palette: z.array(z.object({ id, label: z.string().min(1), symbol: z.string().optional() })).min(1).max(8),
  /** Fixed cells, row-major; "" = open. */
  given: z.array(z.string()).default([]),
  outcomes: outcomes(z.object({ grid: z.array(z.string()) })),
  onNoMatch,
});

/**
 * Simple simulation: set controls, run, read what happened, adjust, run again.
 * Readouts are decided by the SERVER from the variables the run set, so the
 * model behind them never reaches the page.
 */
export const simulationConfig = z.object({
  ...base,
  controls: z.array(control).min(1).max(6),
  readouts: z.array(z.object({ when: condition, text: z.string().min(1) })).min(1),
  runLabel: z.string().default("Run it"),
  /** Runs required before Continue is offered. */
  minRuns: z.number().int().min(0).default(1),
});

/**
 * The persistent workspace (Plan §4): a board defined once in the mission
 * definition (`workspaces`) and shown on any number of screens. Placements and
 * links persist in `state.workspaces[key]` across screens and sessions.
 */
export const workspaceConfig = z.object({
  ...base,
  workspace: z.string().min(1),
  /** `review` shows the board as it stands without changing it. */
  mode: z.enum(["arrange", "review"]).default("arrange"),
  /** Objects that must be placed before continuing. */
  requirePlaced: z.array(z.string()).default([]),
});

export const libraryConfigByType = {
  numeric_entry: numericEntryConfig,
  code_entry: codeEntryConfig,
  token_sequence: tokenSequenceConfig,
  arrange: arrangeConfig,
  matching: matchingConfig,
  allocate: allocateConfig,
  inventory: inventoryConfig,
  compare: compareConfig,
  hotspot: hotspotConfig,
  sketch: sketchConfig,
  map: mapConfig,
  pattern_grid: patternGridConfig,
  simulation: simulationConfig,
  workspace: workspaceConfig,
} as const;

export type LibraryType = keyof typeof libraryConfigByType;
export const libraryTypes = Object.keys(libraryConfigByType) as LibraryType[];

/** Definition-level workspace (definition.ts `workspaces`). */
export const workspaceDef = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    kind: z.enum(["evidence", "clues", "route", "resources", "system", "priorities", "relationships", "plan"]).default("evidence"),
    zones: z.array(item).min(1).max(12),
    objects: z.array(item.extend({ when: condition.optional() })).min(1).max(40),
    /** Allow links between objects (relationship maps, system maps). */
    links: z.boolean().default(false),
    maxLinks: z.number().int().positive().max(80).default(30),
  })
  .strict();
export type WorkspaceDef = z.infer<typeof workspaceDef>;
