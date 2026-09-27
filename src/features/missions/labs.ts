import type { WlaLab } from "@/types/database";

/**
 * The five Labs (Public Website Master §4).
 *
 * Designer Brief §32: "Do not make each Lab its own colour brand. The five
 * Labs belong to one WLA system." Hence labels only — no per-Lab palette.
 */
export const LAB_LABEL: Record<WlaLab, string> = {
  challenge: "Challenge Lab",
  decision: "Decision Lab",
  curiosity: "Curiosity Lab",
  wellbeing: "Wellbeing Lab",
  navigation: "Navigation Lab",
};

/**
 * Per-Lab line-art icons.
 *
 * The public site sets a charcoal-olive line glyph before every mission's meta
 * row and again in its Labs rail — dividers for Challenge, scales for
 * Decision, an eye for Curiosity, a sprout for Wellbeing, a compass for
 * Navigation. They are part of the design language, not decoration.
 *
 * Supplied by the client on 2026-09-27, drawn in Deep Olive on a 40×40 grid at
 * a 1.25 stroke. They were NOT redrawn from the screenshots: D-39 records that
 * absent assets are not substituted, and a guard fails if one is invented.
 *
 * Decorative in use — the Lab name is the first item of the meta row the glyph
 * sits in, so <LabIcon> hides them from assistive technology rather than
 * announcing the same fact twice.
 */
export const LAB_ICON: Record<WlaLab, string | null> = {
  challenge: "/labs/challenge.svg",
  decision: "/labs/decision.svg",
  curiosity: "/labs/curiosity.svg",
  wellbeing: "/labs/wellbeing.svg",
  navigation: "/labs/navigation.svg",
};

/**
 * The short line a Lab puts under a mission's title.
 *
 * The Six Names Academy Build Brief's ENTRY section requires Mission Home to
 * show "Choose. Weigh. Reflect." between the Lab name and the age range, and
 * the Child Mission sets it in the same position on the printed materials.
 *
 * Only the Decision Lab's is known. The other four are null rather than
 * invented — the same rule as LAB_ICON (D-39), and <MissionIdentity> renders
 * nothing when a Lab has none.
 */
export const LAB_TAGLINE: Record<WlaLab, string | null> = {
  challenge: null,
  decision: "Choose. Weigh. Reflect.",
  curiosity: null,
  wellbeing: null,
  navigation: null,
};
