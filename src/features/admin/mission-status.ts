/**
 * WHAT IS LIVE, AND WHERE — two separate facts the builder must never blur.
 *
 *   1. A mission VERSION is published for learners (`mission_versions.status`,
 *      exactly one published per mission). New learners start on it; anyone
 *      already started keeps the version they began (D-17).
 *   2. The MISSION is shown in the catalogue (`missions.published`), which is
 *      what makes it appear publicly and be bought.
 *
 * Each sentence here is built from one of those facts, read from the
 * database. Nothing is inferred from a combination the data does not state —
 * in particular, "available to buy" is never claimed: purchase also depends on
 * a price, which is reported separately and not judged here.
 */

export type VersionLite = { version: number; status: string };
export type VersionUsage = { version: number; runs: number; complete: number };

export function liveVersionOf(versions: readonly VersionLite[]): number | null {
  return versions.find((v) => v.status === "published")?.version ?? null;
}

const learners = (n: number) => `${n} learner${n === 1 ? "" : "s"}`;

/** "Started and not finished" on one version — progress rows are created at start. */
export function inProgressOn(usage: readonly VersionUsage[], version: number): number {
  const u = usage.find((x) => x.version === version);
  return u ? Math.max(0, Number(u.runs) - Number(u.complete)) : 0;
}

export function missionStatusLines(input: {
  versions: readonly VersionLite[];
  catalogueVisible: boolean;
  isFree: boolean;
  priceMinor: number | null;
  /** The version being looked at, when on a version's page. */
  editing?: VersionLite | null;
}): string[] {
  const live = liveVersionOf(input.versions);
  const lines: string[] = [];
  lines.push(live === null ? "No version is live for learners yet." : `Version ${live} is live for learners.`);
  lines.push(
    input.catalogueVisible
      ? `The mission is shown in the catalogue${input.isFree ? " as a free mission" : input.priceMinor ? "" : ", but it has no price set"}.`
      : "The mission is hidden from the catalogue.",
  );
  if (input.editing && input.editing.version !== live) {
    const label = input.editing.status === "in_review" ? "ready for review" : input.editing.status;
    lines.push(`You are looking at version ${input.editing.version} (${label}). ${["draft", "in_review"].includes(input.editing.status) ? "Changes here affect nobody until it is published." : "It is locked."}`);
  }
  return lines;
}

/** The sentences the publish confirmation shows. Built only from real data. */
export function publishImpact(input: {
  version: number;
  versions: readonly VersionLite[];
  usage: readonly VersionUsage[];
  catalogueVisible: boolean;
}): string[] {
  const live = liveVersionOf(input.versions);
  const out: string[] = [`New learners who start this mission will get version ${input.version}.`];
  if (live !== null && live !== input.version) {
    const n = inProgressOn(input.usage, live);
    out.push(
      `Version ${live} stops being offered to new learners and is archived, not deleted.` +
        (n > 0 ? ` ${learners(n)} partway through version ${live} will stay on it.` : ` No one is partway through version ${live}.`),
    );
  }
  const older = input.versions
    .filter((v) => v.status === "archived" && v.version !== input.version)
    .map((v) => ({ v: v.version, n: inProgressOn(input.usage, v.version) }))
    .filter((x) => x.n > 0);
  for (const o of older) out.push(`${learners(o.n)} on version ${o.v} also ${o.n === 1 ? "stays" : "stay"} on it.`);
  out.push(
    `Publishing doesn't change whether the mission is shown in the catalogue. It is currently ${input.catalogueVisible ? "shown" : "hidden"} — change that in the mission details.`,
  );
  return out;
}
