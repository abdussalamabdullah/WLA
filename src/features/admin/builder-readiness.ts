/**
 * BUILDER SECTIONS AND READINESS — what the section index and the readiness
 * checklist show (D-116).
 *
 * ADVISORY ONLY. Every status here is derived from the same automated QA the
 * page already runs (validator.ts + the database's Kit/parent-note checks,
 * merged in `draftQaReport`) plus the mission row. Nothing here can make a
 * version publishable: `set_mission_version_status` re-runs
 * `validate_mission_version` in the publishing transaction and is the only
 * gate. A "recommended" item never blocks anything.
 *
 * Statuses are deliberately modest. "No problems found" means the automated
 * checks found none — not that a person has reviewed the section.
 */

export type SectionId = "details" | "screens" | "logic" | "media" | "kit" | "completion" | "review";

export const SECTIONS: { id: SectionId; label: string; anchor: string }[] = [
  { id: "details", label: "Details", anchor: "builder-details" },
  { id: "screens", label: "Screens & flow", anchor: "builder-screens" },
  { id: "logic", label: "Mission logic", anchor: "mission-logic" },
  { id: "media", label: "Media", anchor: "media-assets" },
  { id: "kit", label: "Kit & For Parents", anchor: "builder-kit" },
  { id: "completion", label: "Completion", anchor: "builder-completion" },
  { id: "review", label: "Review & publish", anchor: "builder-review" },
];

export type BuilderIssue = {
  code: string;
  blocking: boolean;
  screen_key: string | null;
  detail: string;
  category?: string;
};

const COMPLETION = new Set(["no_completion_rule", "no_completion_screen", "completion_screen_skipped"]);
const KIT = new Set([
  "no_kit_resources", "kit_resource_without_file", "no_parent_note", "missing_kit_resource",
  "qr_missing_resource", "print_missing_base", "print_image_kind", "print_adds_nothing",
]);
const MEDIA = new Set(["missing_alt_text", "missing_captions", "missing_transcript"]);
const DETAILS = new Set(["age_range_outside_platform", "age_band_outside_platform", "age_band_outside_mission"]);

/** Which section an issue is fixed in. */
export function sectionOf(issue: BuilderIssue): SectionId {
  if (COMPLETION.has(issue.code)) return "completion";
  if (KIT.has(issue.code)) return "kit";
  if (MEDIA.has(issue.code)) return "media";
  if (DETAILS.has(issue.code)) return "details";
  if (issue.code === "missing_asset" && !issue.screen_key) return "media";
  if (issue.screen_key) return "screens";
  if (issue.category === "logic" || issue.code === "invalid_definition") return "logic";
  return "screens";
}

export type SectionStatus =
  | { kind: "needs_attention"; text: string }
  | { kind: "not_started"; text: string }
  | { kind: "suggestions"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "optional"; text: string };

export type ReadinessCheck = {
  section: SectionId;
  /** Required = the publish gate enforces it; recommended = advice only. */
  level: "required" | "recommended";
  text: string;
  /** Why it matters / what to do, in one sentence. */
  why?: string;
  screenKey?: string | null;
};

export type BuilderFacts = {
  issues: readonly BuilderIssue[];
  screenCount: number;
  resourceCount: number;
  hasParentNote: boolean;
  /** Is any completion mechanism set (rule or definition condition)? */
  hasCompletion: boolean;
  /** Mission logic items in use (variables, unlocks, …). */
  logicInUse: number;
  mediaCount: number;
  details: { description: string | null; coverImage: string | null; priceMinor: number | null; isFree: boolean };
  /** Branch test: routes played and how many reach completion. */
  paths: { total: number; complete: number };
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function sectionStatuses(f: BuilderFacts): Record<SectionId, SectionStatus> {
  const by = (id: SectionId) => f.issues.filter((i) => sectionOf(i) === id);
  const status = (id: SectionId, opts: { required?: boolean; started: boolean; optional?: boolean }): SectionStatus => {
    const list = by(id);
    const blocking = list.filter((i) => i.blocking).length;
    const advisory = list.length - blocking;
    if (blocking) return { kind: "needs_attention", text: `Needs attention (${blocking})` };
    if (!opts.started) return opts.optional ? { kind: "optional", text: "Optional · not used" } : { kind: "not_started", text: "Not started" };
    if (advisory) return { kind: "suggestions", text: plural(advisory, "suggestion") };
    return { kind: "ok", text: "No problems found" };
  };

  const detailsMissing = detailsGaps(f.details).length;
  const details: SectionStatus = by("details").some((i) => i.blocking)
    ? { kind: "needs_attention", text: `Needs attention (${by("details").filter((i) => i.blocking).length})` }
    : detailsMissing
      ? { kind: "suggestions", text: `${plural(detailsMissing, "detail")} missing` }
      : { kind: "ok", text: "No problems found" };

  const totalBlocking = f.issues.filter((i) => i.blocking).length;
  const review: SectionStatus = totalBlocking
    ? { kind: "needs_attention", text: `${plural(totalBlocking, "problem")} to fix before publishing` }
    : f.screenCount === 0
      ? { kind: "not_started", text: "Not started" }
      : { kind: "ok", text: "No blocking problems found" };

  return {
    details,
    screens: status("screens", { started: f.screenCount > 0 }),
    logic: status("logic", { started: f.logicInUse > 0, optional: true }),
    media: status("media", { started: f.mediaCount > 0, optional: true }),
    kit: status("kit", { started: f.resourceCount > 0 || f.hasParentNote }),
    completion: status("completion", { started: f.hasCompletion }),
    review,
  };
}

function detailsGaps(d: BuilderFacts["details"]): string[] {
  const gaps: string[] = [];
  if (!d.description?.trim()) gaps.push("Add a catalogue description — it's the short line on the public mission card and on Mission Home.");
  if (!d.coverImage?.trim()) gaps.push("Add a cover image for the catalogue.");
  if (!d.isFree && !d.priceMinor) gaps.push("Set a price, or mark the mission as free, before showing it in the catalogue.");
  return gaps;
}

/** What to do about an issue — the detail already says what is wrong. */
const WHY: Record<string, string> = {
  dead_end: "A learner who reaches it is stranded. Give it a “Goes to”, or make it the completion screen.",
  broken_reference: "Choose a screen that exists in this version.",
  unreachable_screen: "Link to it from another screen, or remove it.",
  cannot_reach_complete: "Follow that route in the branch test below to find where it stops.",
  no_screens: "Start from a pattern or add your first screen in Screens & flow.",
  no_completion_rule: "Choose the screen that ends the mission in Completion.",
  no_completion_screen: "Add a screen of type “Completion — the end” and lead the last screens to it.",
  no_kit_resources: "Add the printable or resource the child works from in Mission Kit.",
  kit_resource_without_file: "Edit the resource and attach its file.",
  no_parent_note: "Write the note in For Parents. An attached PDF alone doesn't count.",
  invalid_config: "Open the screen and fix the setting named above.",
  duplicate_sequence: "Move one of the two screens with the arrows.",
};

/** The readiness checklist, required items first. */
export function readinessChecks(f: BuilderFacts): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  for (const i of f.issues) {
    checks.push({
      section: sectionOf(i),
      level: i.blocking ? "required" : "recommended",
      text: i.detail,
      why: WHY[i.code],
      screenKey: i.screen_key,
    });
  }
  for (const g of detailsGaps(f.details)) checks.push({ section: "details", level: "recommended", text: g });
  const alreadyReported = f.issues.some((i) => i.code === "cannot_reach_complete");
  if (!alreadyReported && f.screenCount > 0 && f.paths.total > 0 && f.paths.complete < f.paths.total) {
    checks.push({
      section: "review",
      level: "recommended",
      text: `The branch test reached the end on ${f.paths.complete} of ${f.paths.total} routes.`,
      why: "Open the branch test below to see which routes stop early.",
    });
  }
  return checks.sort((a, b) => (a.level === b.level ? 0 : a.level === "required" ? -1 : 1));
}
