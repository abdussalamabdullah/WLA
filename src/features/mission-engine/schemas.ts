import { z } from "zod";
import { condition as conditionSchema } from "./conditions";
import { libraryConfigByType } from "./interactions/schemas";

/**
 * MISSION SCREEN CONFIGURATION SCHEMAS
 *
 * Tech Spec §12 permits a flexible JSON state/config field "provided it is
 * validated and controlled by the mission engine". These schemas are that
 * control. Nothing reaches a renderer without passing through here.
 *
 * Tech Spec §18: this is NOT a no-code mission builder. It is the contract
 * between an authored mission and the shared engine.
 */

/** Where to go next. Absent `next` on a non-terminal screen = advance by sequence. */
const nextRef = z.string().min(1).optional();

/**
 * Mission Control support, per screen (Architecture §12, Brief §7).
 *
 * Lives in mission configuration — NEVER hard-coded into the component — so
 * copy can be revised without touching the engine, and so support is only
 * available on the screens the mission says it should be.
 *
 * Because it travels inside `configuration`, and configuration is only ever
 * served for the child's CURRENT screen, support for a future screen is never
 * sent to the browser either.
 *
 * It must not recommend an option, reveal concealed content or imply a correct
 * answer. Those are review conditions, not something a schema can enforce.
 */
const missionControl = z
  .array(z.object({ title: z.string().min(1), body: z.string().min(1) }))
  .default([]);

/**
 * CANONICAL TRACKER STATE — dimension id → position label.
 *
 * The Build Brief requires the Academy to confirm, and persist, the tracker
 * state that belongs to the branch the child is actually on. It is a property
 * of the authored mission, not something the child reports.
 *
 * So it is declared here, in configuration, and applied BY THE SERVER when the
 * child advances off the screen that declares it. The browser never sends it
 * and cannot influence it. See `applyCanonicalTracker` in persistence.ts.
 *
 * A screen may patch a subset — Evidence sets Clarity alone, leaving Spread
 * and Support exactly as the branch left them.
 */
const canonicalTracker = z
  .record(z.string().min(1), z.string().min(1))
  .default({});

/** Architecture §9 / UI/UX §36 — plain instruction or context. */
export const contentConfig = z.object({
  next: nextRef,
  missionControl,
  /** Physical instruction shown with the screen, e.g. "Record this on Zone 3." */
  instruction: z.string().optional(),
  /** Label for the primary action. Defaults per screen type in the component. */
  actionLabel: z.string().optional(),
  /** Optional mission-supplied image. Object-led only (UI/UX §14). */
  image: z.string().optional(),
  imageAlt: z.string().optional(),
  /**
   * A second, quieter way off this screen that LEAVES the mission rather than
   * advancing it — the Build Brief's "Good stopping point ... Pause Mission".
   *
   * It carries no target: leaving always returns to Mission Home, where
   * Continue Mission resumes from the persisted position. A screen therefore
   * cannot use this to send a child anywhere the mission graph does not
   * already allow.
   */
  secondaryAction: z.string().optional(),
  /**
   * Short prompts shown under the body for the child to consider.
   *
   * Read-and-reflect only. There is no field, and nothing is stored — see the
   * `reflection` screen type, which exists for the same reason.
   */
  reflectionPrompts: z.array(z.string().min(1)).default([]),
  /**
   * A LIST OBJECT — the case object itself, not page copy.
   *
   * Six Names turns on a plain sheet of names that is later altered, and the
   * alteration has to be unmistakable: a name struck through, two names added.
   * Rendering that as body text would lose the distinction to anyone reading
   * with assistive technology, so the change is structured data and the
   * component states it in words as well as in visual form.
   *
   * Generic: any mission may need to show an object that changes.
   */
  listObject: z
    .array(
      z.object({
        text: z.string().min(1),
        mark: z.enum(["none", "struck", "added"]).default("none"),
      }),
    )
    .default([]),
  /** Accessible name for the list object, e.g. "The list, as it now reads". */
  listLabel: z.string().optional(),
  /** See `canonicalTracker` below. Applied server-side on advance. */
  canonicalTracker: canonicalTracker,
});

/** Brief §21 — a decision. Options may branch (Tech Spec §16). */
export const choiceConfig = z.object({
  prompt: z.string().min(1),
  missionControl,
  instruction: z.string().optional(),
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        /**
         * The response in full, under its short label. Both Six Names
         * decisions are authored this way — a name to compare, then what it
         * actually means. Optional, because not every decision needs it.
         */
        description: z.string().optional(),
        /** Branch target. This is what makes branching configuration, not code. */
        next: nextRef,
      }),
    )
    .min(1),
  /**
   * Shown once a response is selected and before it is confirmed.
   *
   * Six Names uses it to send the child back to the physical tracker to
   * predict what might change. It is deliberately a NOTE and not a field: the
   * Build Brief requires the prediction to happen on paper and forbids storing
   * it, so there is nowhere here for an answer to go.
   */
  confirmNote: z.string().optional(),
  /** Label for the confirm action. */
  confirmLabel: z.string().optional(),
  /** Whether the child can change their mind once confirmed. */
  locksOnConfirm: z.boolean().default(false),
});

/** Brief §21 — short text or structured input. */
export const responseConfig = z.object({
  prompt: z.string().min(1),
  missionControl,
  instruction: z.string().optional(),
  /**
   * Structural prompts shown above a SINGLE field (Q1).
   *
   * Six Names' Final Judgement card carries three prompts but instructs
   * "write one or two brief sentences in total" — so the prompts are the
   * shape of the reflection, not three separate answers. The physical card
   * remains the primary artefact; this field is the private Trail evidence.
   */
  promptLines: z.array(z.string().min(1)).default([]),
  inputType: z
    .enum(["short_text", "long_text", "confirm"])
    .default("short_text"),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().max(2000).default(500),
  required: z.boolean().default(true),
  /** Architecture §15: does this answer become Mission Trail evidence? */
  contributesToTrail: z.boolean().default(false),
  next: nextRef,
});

/** Brief §21 — content concealed until a condition is met. */
export const revealConfig = z.object({
  missionControl,
  /** Shown before the reveal unlocks. */
  concealedPrompt: z.string().min(1),
  /** Label for the action that opens a `child_action` reveal. */
  revealLabel: z.string().default("Show me"),
  revealedTitle: z.string().optional(),
  revealedBody: z.string().min(1),
  condition: z.union([z.discriminatedUnion("type", [
    /** Unlocks when the child explicitly asks — the common case. */
    z.object({ type: z.literal("child_action") }),
    /** Unlocks based on an earlier choice. */
    z.object({
      type: z.literal("choice_equals"),
      screenKey: z.string().min(1),
      optionId: z.string().min(1),
    }),
    /** Unlocks once an earlier response exists. */
    z.object({
      type: z.literal("response_exists"),
      screenKey: z.string().min(1),
    }),
  ], ), z.lazy(() => conditionSchema)]),
  /**
   * Prompts shown AFTER the reveal. Read-and-reflect; no field, nothing
   * stored. Six Names' Evidence asks "What does this evidence explain? What
   * does it not undo?" and must not collect an answer to either.
   */
  reflectionPrompts: z.array(z.string().min(1)).default([]),
  /** Applied server-side when the reveal is opened. */
  canonicalTracker: canonicalTracker,
  next: nextRef,
});

/**
 * Brief §24 / Architecture §11 — the screen-to-physical handoff.
 * Must answer: where do I go, what do I do, when do I come back?
 */
export const handoffConfig = z.object({
  missionControl,
  /** "Where do I go?" */
  location: z.string().min(1),
  /** "What do I do?" — ordered steps. */
  steps: z.array(z.string().min(1)).min(1),
  /** "When do I come back?" */
  returnInstruction: z.string().min(1),
  /** Label for the return control, e.g. "I'm ready". */
  returnLabel: z.string().default("I'm ready"),
  /** Mission Kit resources the child needs in hand for this step. */
  requiredResourceIds: z.array(z.string()).default([]),
  next: nextRef,
});

/**
 * Architecture §10 — preparation, distinct from a mid-mission handoff.
 *
 * Orients the child before the mission begins: what is needed now, whether
 * anything must be printed, where to find it. "Preparation should orient, not
 * repeat the Child Mission."
 */
export const prepareConfig = z.object({
  missionControl,
  /** What the child needs in front of them. */
  materials: z.array(z.string().min(1)).min(1),
  /** Anything they must NOT do yet, e.g. "Do not turn over any cards." */
  cautions: z.array(z.string().min(1)).default([]),
  /** Mission Kit resources to surface inline. */
  requiredResourceIds: z.array(z.string()).default([]),
  readyLabel: z.string().default("I'm ready"),
  next: nextRef,
});

/**
 * Select exactly N of M options.
 *
 * Six Names uses it for Concern cards: "Choose TWO Concern cards."
 *
 * IMPORTANT (Q2): a multi_choice is RECORDED, never branching. It captures
 * what matters to the child. What the child decides to DO is a `choice`, and
 * only that determines the consequence. Hence no `next` on the options here.
 */
export const multiChoiceConfig = z.object({
  prompt: z.string().min(1),
  missionControl,
  instruction: z.string().optional(),
  options: z
    .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
    .min(2),
  /** Exactly this many must be selected before advancing. */
  selectExactly: z.number().int().positive().default(2),
  next: nextRef,
});

/**
 * A set of labelled positional scales.
 *
 * Six Names' What's Changing? tracker: Spread, Support, Clarity — each with
 * three named positions.
 *
 * This is reflection, NOT a score (Architecture §14, Brief §26). Positions
 * carry labels, never numbers, and nothing aggregates them. There is no
 * "correct" arrangement and none is evaluated.
 */
export const trackerConfig = z.object({
  prompt: z.string().min(1),
  missionControl,
  instruction: z.string().optional(),
  dimensions: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        /** Ordered positions, low to high. Labels only — never scores. */
        positions: z.array(z.string().min(1)).min(2),
      }),
    )
    .min(1),
  /** Every dimension must be placed before advancing. */
  required: z.boolean().default(true),
  next: nextRef,
});

/**
 * Classify a shuffled set of items, one at a time.
 *
 * ORIENTATION, NOT ASSESSMENT. The authored classification is shown after each
 * selection so the child can check and correct their own thinking. No score is
 * computed, none is stored, and nothing distinguishes a child who matched
 * every classification from one who matched none — which is why the schema has
 * nowhere to put a result.
 *
 * Nothing about the activity is persisted beyond having completed it. The
 * Build Brief's STATE TO PERSIST list does not include per-item progress, and
 * "persist only what is necessary to resume safely" is satisfied by resuming
 * at the activity itself.
 */
export const sortItemsConfig = z.object({
  missionControl,
  instruction: z.string().optional(),
  /** Shown once, above the current item. */
  prompt: z.string().min(1),
  /** The equal choices offered for every item. Order is preserved. */
  categories: z
    .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
    .min(2),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1),
        /** Must match a category id. Revealed after the child selects. */
        classification: z.string().min(1),
      }),
    )
    .min(1),
  /** Shuffle the presentation order. The Brief requires it for Six Names. */
  shuffle: z.boolean().default(true),
  actionLabel: z.string().optional(),
  next: nextRef,
});

/**
 * A read-only confirmation of canonical tracker state.
 *
 * The child moves physical counters; this states what the Academy holds to be
 * true for their branch, so they can check and correct their own tracker. It
 * offers no controls, which is the point — see `canonicalTracker`.
 */
export const trackerConfirmationConfig = z.object({
  missionControl,
  instruction: z.string().optional(),
  /** Ordered rows: label plus the canonical position for this branch. */
  rows: z
    .array(z.object({ label: z.string().min(1), position: z.string().min(1) }))
    .min(1),
  /** The same values keyed by dimension id, persisted server-side. */
  canonicalTracker: canonicalTracker,
  actionLabel: z.string().optional(),
  next: nextRef,
});

/**
 * Read-and-reflect. Collects nothing.
 *
 * `unusedFrom` names an earlier choice screen; the component shows the options
 * from that screen the child did NOT pick, so they can consider one. Those are
 * labels the child was already shown when they decided — never consequences,
 * which live on their own screens and are never fetched (see the screen_access
 * migration).
 *
 * `selectable` lets the child pick one of those to think about. That selection
 * is local to the screen and is deliberately given nowhere to go: there is no
 * interaction kind for it, so it cannot be persisted even by mistake.
 */
export const reflectionConfig = z.object({
  missionControl,
  instruction: z.string().optional(),
  prompts: z.array(z.string().min(1)).min(1),
  /** Screen key of an earlier `choice`. Its unchosen options are listed. */
  unusedFrom: z.string().optional(),
  /** Heading for that list, e.g. "Which one would you now consider?" */
  unusedPrompt: z.string().optional(),
  /** All option ids/labels from `unusedFrom`, so the chosen one can be filtered. */
  unusedOptions: z
    .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
    .default([]),
  selectable: z.boolean().default(false),
  actionLabel: z.string().optional(),
  next: nextRef,
});

/** Architecture §14 — the end of the mission. */
export const completionConfig = z.object({
  message: z.string().min(1),
  /** Architecture §14: completion must not be blocked by an upsell. */
  trailSummary: z.string().optional(),
  /**
   * Mission Trail entries created atomically on completion.
   *
   * `physical` records that an artefact belongs to the Trail without claiming
   * the Academy holds it (Architecture §15, Brief §27). `digital` with
   * `fromResponse` stores the child's own saved answer. Neither requires an
   * upload (Brief §6).
   */
  trailEntries: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("physical"),
          title: z.string().min(1),
          description: z.string().min(1),
        }),
        z.object({
          type: z.literal("digital"),
          title: z.string().min(1),
          fromResponse: z.string().min(1),
        }),
      ]),
    )
    .default([]),
});

export const screenConfigByType = {
  content: contentConfig,
  choice: choiceConfig,
  response: responseConfig,
  reveal: revealConfig,
  handoff: handoffConfig,
  prepare: prepareConfig,
  multi_choice: multiChoiceConfig,
  tracker: trackerConfig,
  sort_items: sortItemsConfig,
  tracker_confirmation: trackerConfirmationConfig,
  reflection: reflectionConfig,
  completion: completionConfig,
  /** The interaction library (interactions/schemas.ts, D-86). */
  ...libraryConfigByType,
} as const;

export type ScreenType = keyof typeof screenConfigByType;

/**
 * Tech Spec §31: completion is evaluated from mission configuration.
 * Explicitly NOT `if (missionId === "mars")`.
 */
export const completionRule = z.discriminatedUnion("type", [
  z.object({ type: z.literal("screen_reached"), screenKey: z.string().min(1) }),
  z.object({
    type: z.literal("conditions"),
    conditions: z.array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("response_exists"), screenKey: z.string() }),
        z.object({
          kind: z.literal("choice_equals"),
          screenKey: z.string(),
          optionId: z.string(),
        }),
        /**
         * A choice was made, without caring which.
         *
         * Six Names completion requires *a* Judgement card — standing by both
         * decisions and reconsidering one are equally complete. Brief §10:
         * "Neither branch is labelled correct or incorrect."
         */
        z.object({ kind: z.literal("choice_exists"), screenKey: z.string() }),
        /** A screen was reached, e.g. Later Evidence was shown. */
        z.object({ kind: z.literal("screen_visited"), screenKey: z.string() }),
      ]),
    ),
  }),
  /**
   * Any condition the shared evaluator understands (F2). The two shapes
   * above are kept because published versions and pinned runs carry them
   * (D-17); they are translated into this form, never evaluated separately.
   */
  z.object({ type: z.literal("condition"), when: z.lazy(() => conditionSchema) }),
]);

export type CompletionRule = z.infer<typeof completionRule>;

/**
 * Persisted learner state (mission_state.state_data).
 * Architecture §19 — the shared engine must not force every mission into the
 * same sequence, so this records only what is universally true. Anything
 * mission-specific belongs in `custom`, owned by that mission's Build Brief.
 */
export const missionStateData = z.object({
  visitedScreens: z.array(z.string()).default([]),
  /** screenKey → chosen optionId. Establishes branches (Architecture §13). */
  choices: z.record(z.string(), z.string()).default({}),
  /** Reveals stay revealed across sessions (Architecture §13). */
  revealed: z.array(z.string()).default([]),
  /** Handoffs the child has confirmed returning from. */
  confirmedHandoffs: z.array(z.string()).default([]),
  /**
   * screenKey → selected option ids, for multi_choice screens.
   *
   * Recorded, never branching (Q2). Decision 2 may repeat Decision 1's
   * selections or differ entirely — both are kept, keyed by screen.
   */
  multiChoices: z.record(z.string(), z.array(z.string())).default({}),
  /**
   * Screens with a saved response. The answers themselves live in
   * `mission_responses`; this mirror lets completion be evaluated without a
   * second query, and is written in the same transaction as the response.
   */
  respondedScreens: z.array(z.string()).default([]),
  custom: z.record(z.string(), z.unknown()).default({}),
  /*
   * F1 — added by the engine foundation. Every field defaults to empty, so
   * state written before the foundation (Six Names runs in flight) parses
   * unchanged.
   */
  /** Declared mission variables (variables.ts). Hidden ones are stored privately. */
  variables: z.record(z.string(), z.unknown()).default({}),
  /** Unlock keys gained, in order. Monotonic within a run. */
  unlocked: z.array(z.string()).default([]),
  /** Validation attempts per screen, for retry limits and analytics. */
  attempts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  /** Server-time marks: `start`, `screen:<key>`, `checkpoint:<key>`, `event:<key>`. */
  marks: z.record(z.string(), z.string()).default({}),
  /** Changing-condition events already fired. Stored privately. */
  firedEvents: z.array(z.string()).default([]),
  /** The approved variant this run uses. Stored privately; recorded for consistency. */
  variant: z.string().nullable().default(null),
  /** Randomisation seed — server-generated, stored privately, never sent to a client. */
  seed: z.number().int().nullable().default(null),
  /** Persistent interactive workspaces: placements and links by workspace key. */
  workspaces: z.record(z.string(), z.unknown()).default({}),
  /** screenKey → matched outcome id for graded library input (interactions/). */
  outcomes: z.record(z.string(), z.string()).default({}),
});

export type MissionStateData = z.infer<typeof missionStateData>;

export const emptyMissionState: MissionStateData = {
  visitedScreens: [],
  choices: {},
  revealed: [],
  confirmedHandoffs: [],
  multiChoices: {},
  respondedScreens: [],
  custom: {},
  variables: {},
  unlocked: [],
  attempts: {},
  marks: {},
  firedEvents: [],
  variant: null,
  seed: null,
  workspaces: {},
  outcomes: {},
};

/**
 * A meaningful mission interaction — Tech Spec §29 lists exactly when state is
 * saved: "choice confirmed; response submitted; reveal unlocked; branch
 * established; physical handoff confirmed; screen/state transition."
 *
 * This union IS that list. Transient UI concerns — hover, open tooltips,
 * animation, scroll position, which panel is expanded — are deliberately
 * absent and must never be added (Tech Spec §52).
 *
 * `custom` carries mission-specific state defined by a future Mission Build
 * Brief, so the engine never needs a per-mission branch.
 */
export const missionInteraction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("visit"), screenKey: z.string().min(1) }),
  z.object({
    kind: z.literal("choice"),
    screenKey: z.string().min(1),
    optionId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("response"),
    screenKey: z.string().min(1),
    value: z.unknown(),
  }),
  z.object({ kind: z.literal("reveal"), screenKey: z.string().min(1) }),
  z.object({
    kind: z.literal("multi_choice"),
    screenKey: z.string().min(1),
    optionIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    kind: z.literal("tracker"),
    screenKey: z.string().min(1),
    /** dimension id → chosen position index. Labels, not scores. */
    positions: z.record(z.string(), z.number().int().nonnegative()),
  }),
  z.object({ kind: z.literal("handoff"), screenKey: z.string().min(1) }),
  z.object({
    kind: z.literal("custom"),
    key: z.string().min(1),
    value: z.unknown(),
  }),
  /**
   * F4 — the generic interaction for every contract-based screen type. The
   * value's shape is checked by that type's contract (contract.ts), on the
   * server, before anything changes.
   */
  z.object({ kind: z.literal("submit"), screenKey: z.string().min(1), value: z.unknown() }),
  /** Clear this screen's input and try again, where the screen allows it (D-78). */
  z.object({ kind: z.literal("retry"), screenKey: z.string().min(1) }),
  /** A timed stage ran out. Accepted only once server time agrees. */
  z.object({ kind: z.literal("timer_expired"), screenKey: z.string().min(1) }),
]);

export type MissionInteraction = z.infer<typeof missionInteraction>;

/** Parse a screen's stored configuration against its type. */
export function parseScreenConfig<T extends ScreenType>(
  type: T,
  configuration: unknown,
): z.infer<(typeof screenConfigByType)[T]> {
  const schema = screenConfigByType[type];
  const result = schema.safeParse(configuration);
  if (!result.success) {
    throw new Error(
      `Invalid configuration for "${type}" screen: ${result.error.message}`,
    );
  }
  return result.data as z.infer<(typeof screenConfigByType)[T]>;
}

/**
 * Parse persisted state. Unknown or malformed data degrades to empty rather
 * than throwing — a child mid-mission must never be locked out by a state
 * shape they cannot fix. Tech Spec §53's `mission_version` exists for the
 * same reason.
 */
export function parseMissionState(raw: unknown): MissionStateData {
  const result = missionStateData.safeParse(raw ?? {});
  return result.success ? result.data : emptyMissionState;
}
