import { evaluate } from "./conditions";
import { isRevealed, applyInteraction, type MissionScreen } from "./navigation";
import {
  parseScreenConfig,
  type MissionInteraction,
  type MissionStateData,
  type ScreenType,
} from "./schemas";
import type { MissionModel } from "./definition";
import type { Json } from "@/types/database";

/**
 * F4 — THE INTERACTION CONTRACT.
 *
 * Every screen type is one contract. The runtime (runtime.ts) asks the
 * contract — and nothing else — which interactions the screen accepts, whether
 * an input is valid, how state changes, what is stored as a response, whether
 * the child stays or moves on, whether it can be retried, what it contributes
 * to the Mission Trail and analytics, and which configuration fields must never
 * reach the browser. The same contract runs on the server and in Learner
 * Preview, so they cannot disagree.
 *
 * `accepts` is enforcement, not documentation. Before the foundation, any
 * interaction kind was accepted on any screen; with the whole model loaded
 * server-side, a forged `visit` on a decision would otherwise route past it.
 */

export type ContractContext = { model: MissionModel; now: Date };

export type Validation =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type AnalyticsDraft = {
  name: string;
  screen_key?: string | null;
  detail?: Record<string, Json>;
};

export type ContractOutcome = {
  state: MissionStateData;
  /** Stored in mission_responses (and mirrored in state.respondedScreens). */
  response?: { key: string; value: Json } | null;
  /** Stay on this screen (a reveal unlocks in place, D-69). */
  stay?: boolean;
  /** Text available to a `fromInput` Trail marker. */
  inputText?: string | null;
  /** Extra effects decided by the input (e.g. the chosen option's effects). */
  effects?: unknown[];
  /** A route decided by the input itself (e.g. which accepted code was entered). */
  route?: string | null;
  events?: AnalyticsDraft[];
};

export type InteractionContract = {
  type: string;
  accepts: MissionInteraction["kind"][];
  /** Configuration keys the browser must never receive (answers, routes...). */
  secrets?: string[];
  validate?(screen: MissionScreen, i: MissionInteraction, state: MissionStateData, ctx: ContractContext): Validation;
  apply(screen: MissionScreen, i: MissionInteraction, state: MissionStateData, ctx: ContractContext): ContractOutcome;
  /** Client-safe configuration. Must stay valid against the type's schema. */
  project?(config: Record<string, unknown>, screen: MissionScreen, state: MissionStateData, ctx: ContractContext): Record<string, unknown>;
};

const ok: Validation = { ok: true };

/** Options as stored — `when` and `effects` are server-only and not in the parsed schema. */
function rawOptions(screen: MissionScreen): Record<string, unknown>[] & { id?: unknown }[] {
  const o = (screen.configuration as { options?: unknown } | null)?.options;
  return Array.isArray(o) ? (o as Record<string, unknown>[]) : [];
}
const fail = (code: string, message: string): Validation => ({ ok: false, code, message });

/** The pre-foundation reducer, unchanged — the path Six Names has always taken. */
const legacyApply = (screen: MissionScreen, i: MissionInteraction, state: MissionStateData): ContractOutcome => ({
  state: applyInteraction(state, i),
  response:
    i.kind === "response" ? { key: i.screenKey, value: (i.value ?? null) as Json } : null,
  inputText: i.kind === "response" && typeof i.value === "string" ? i.value : null,
});

const visitOnly = (type: string): InteractionContract => ({
  type,
  accepts: ["visit"],
  apply: legacyApply,
});

export const builtInContracts: Record<string, InteractionContract> = {
  content: visitOnly("content"),
  reflection: visitOnly("reflection"),
  tracker_confirmation: visitOnly("tracker_confirmation"),
  sort_items: visitOnly("sort_items"),
  completion: visitOnly("completion"),

  prepare: { type: "prepare", accepts: ["handoff"], apply: legacyApply },
  handoff: {
    type: "handoff",
    accepts: ["handoff"],
    apply: (s, i, st) => ({ ...legacyApply(s, i, st), events: [{ name: "handoff_confirmed", screen_key: s.screenKey }] }),
  },

  choice: {
    type: "choice",
    accepts: ["choice"],
    validate(screen, i, state, ctx) {
      if (i.kind !== "choice") return fail("wrong_kind", "Choose one option.");
      const option = rawOptions(screen).find((o) => o.id === i.optionId);
      if (!option) return fail("unknown_option", "That option isn't available.");
      const when = option.when;
      if (when && !evaluate(when, { state, now: ctx.now })) {
        return fail("option_unavailable", "That option isn't available.");
      }
      return ok;
    },
    apply(screen, i, state) {
      const optionId = i.kind === "choice" ? i.optionId : "";
      const option = rawOptions(screen).find((o) => o.id === optionId);
      return {
        ...legacyApply(screen, i, state),
        effects: Array.isArray(option?.effects) ? option.effects : [],
        events: [{ name: "branch_chosen", screen_key: screen.screenKey, detail: { option: optionId } }],
      };
    },
    project(config, _screen, state, ctx) {
      // Options gated by a condition are withheld, not merely disabled; and
      // where each option leads is the server's business, not the page's.
      const options = (config.options as Record<string, unknown>[]).filter(
        (o) => !o.when || evaluate(o.when, { state, now: ctx.now }),
      ).map((o) => ({ id: o.id, label: o.label, description: o.description }));
      return { ...config, options };
    },
  },

  multi_choice: {
    type: "multi_choice",
    accepts: ["multi_choice"],
    validate(screen, i) {
      if (i.kind !== "multi_choice") return fail("wrong_kind", "Choose your options.");
      const config = parseScreenConfig("multi_choice", screen.configuration);
      const ids = new Set(config.options.map((o) => o.id));
      if (!i.optionIds.every((id) => ids.has(id))) return fail("unknown_option", "That option isn't available.");
      if (new Set(i.optionIds).size !== i.optionIds.length) return fail("duplicate_option", "Each option counts once.");
      if (i.optionIds.length !== config.selectExactly) {
        return fail("wrong_count", `Choose ${config.selectExactly}.`);
      }
      return ok;
    },
    apply: legacyApply,
  },

  tracker: {
    type: "tracker",
    accepts: ["tracker"],
    validate(screen, i) {
      if (i.kind !== "tracker") return fail("wrong_kind", "Set the tracker.");
      const config = parseScreenConfig("tracker", screen.configuration);
      for (const [dim, pos] of Object.entries(i.positions)) {
        const d = config.dimensions.find((x) => x.id === dim);
        if (!d || pos >= d.positions.length) return fail("bad_position", "That position isn't on the tracker.");
      }
      if (config.required && config.dimensions.some((d) => !(d.id in i.positions))) {
        return fail("incomplete", "Set every row of the tracker.");
      }
      return ok;
    },
    apply: legacyApply,
  },

  response: {
    type: "response",
    accepts: ["response"],
    validate(screen, i) {
      if (i.kind !== "response") return fail("wrong_kind", "Add your answer.");
      const config = parseScreenConfig("response", screen.configuration);
      if (config.inputType === "confirm") return i.value === true || i.value === "confirmed" ? ok : fail("not_confirmed", "Confirm when you're done.");
      if (typeof i.value !== "string" || i.value.trim() === "") return fail("empty", "Add your answer.");
      if (i.value.length > config.maxLength) return fail("too_long", `Keep it under ${config.maxLength} characters.`);
      return ok;
    },
    apply: legacyApply,
  },

  reveal: {
    type: "reveal",
    accepts: ["reveal", "visit"],
    secrets: ["condition", "canonicalTracker"],
    validate(screen, i, state, ctx) {
      // Continue only once revealed: the reveal itself cannot be skipped.
      if (i.kind === "visit" && !isRevealed(screen, state, ctx.now)) {
        return fail("not_revealed", "Open it first.");
      }
      return ok;
    },
    apply(screen, i, state) {
      const out = legacyApply(screen, i, state);
      if (i.kind === "reveal") {
        return { ...out, stay: true, events: [{ name: "reveal_opened", screen_key: screen.screenKey }] };
      }
      return out;
    },
    project(config, screen, state, ctx) {
      if (isRevealed(screen, state, ctx.now)) {
        return { ...config, condition: { type: "child_action" } };
      }
      // Withheld until it opens (D-81). Placeholders keep the schema valid;
      // the component shows the concealed prompt, never these.
      return { ...config, condition: { type: "child_action" }, revealedBody: "…", revealedTitle: undefined, reflectionPrompts: [] };
    },
  },
};

/** Contracts registered by the interaction library (interactions/). */
const libraryContracts: Record<string, InteractionContract> = {};

export function registerContract(c: InteractionContract) {
  libraryContracts[c.type] = c;
}

export function contractFor(type: ScreenType | string): InteractionContract | null {
  return builtInContracts[type] ?? libraryContracts[type] ?? null;
}
