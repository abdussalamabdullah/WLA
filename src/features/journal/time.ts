/**
 * JOURNAL TIME POLICY (D-133).
 *
 *   * Every instant is STORED as timestamptz (UTC); the database compares
 *     instants, so the session time zone never changes what is due.
 *   * Editors SCHEDULE in WLA's home time, Europe/London (GMT in winter, BST
 *     in summer), whatever their own device's zone — so "09:00" means the
 *     same thing to everyone on the team.
 *   * Times are SHOWN in Europe/London with the zone abbreviation, plus UTC.
 *
 * Clock changes: a London wall time that does not exist (the hour skipped in
 * late March) is refused; one that happens twice (the hour repeated in late
 * October) takes the first occurrence (BST) and is flagged so the UI can say
 * which one was chosen.
 */
export const JOURNAL_TIME_ZONE = "Europe/London";

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: JOURNAL_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** London wall-clock fields of an instant, as a UTC-epoch number for comparison. */
function londonWall(ms: number): number {
  const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

export type LondonResult =
  | { ok: true; utc: Date; ambiguous: boolean }
  | { ok: false; reason: "invalid" | "nonexistent" };

/** "2026-10-25T01:30" (London wall time) → the UTC instant. */
export function londonWallTimeToUtc(local: string): LondonResult {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return { ok: false, reason: "invalid" };
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wanted = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wanted);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) {
    return { ok: false, reason: "invalid" };
  }
  // London is UTC+0 or UTC+1: try both offsets and keep the ones that land on the wall time.
  const candidates = [0, 60]
    .map((offsetMin) => wanted - offsetMin * 60_000)
    .filter((ms) => londonWall(ms) === wanted)
    .sort((a, b) => a - b);
  if (candidates.length === 0) return { ok: false, reason: "nonexistent" };
  return { ok: true, utc: new Date(candidates[0]), ambiguous: candidates.length > 1 };
}

const londonFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: JOURNAL_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
});
const utcFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "Sun 25 Oct 2026, 01:30 BST (00:30 UTC)". */
export function formatLondon(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${londonFmt.format(d)} (${utcFmt.format(d)} UTC)`;
}
