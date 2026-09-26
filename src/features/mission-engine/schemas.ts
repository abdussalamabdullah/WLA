import { z } from "zod";

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
        /** Branch target. This is what makes branching configuration, not code. */
        next: nextRef,
      }),
    )
    .min(2),
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
  condition: z.discriminatedUnion("type", [
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
  ]),
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
  completion: completionConfig,
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
