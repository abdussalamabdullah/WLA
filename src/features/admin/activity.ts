/**
 * Activity feed copy.
 *
 * Reads as sentences about people, because that is what an activity feed is
 * for: "Aisha started Six Names", not "mission_started: uuid". A child's first
 * name appears — it is already visible to an admin on the Children page — but
 * never what they wrote, chose or reflected on.
 */
export function ACTIVITY_LABEL(
  kind: string,
  subject: string | null,
  detail: string | null,
): string {
  const who = subject ?? "Someone";
  switch (kind) {
    case "mission_started":
      return `${who} started ${detail ?? "a mission"}`;
    case "mission_completed":
      return `${who} completed ${detail ?? "a mission"}`;
    case "parent_registered":
      return `New parent registered — ${who}`;
    case "child_added":
      return `New child profile added — ${who}`;
    case "mission_published":
      return `Mission published — ${who}${detail ? ` ${detail}` : ""}`;
    default:
      return `${who} ${kind.replace(/_/g, " ")}`;
  }
}

/** Calm relative time. Not a live-updating timer. */
export function formatWhen(iso: string): string {
  const then = new Date(iso);
  const mins = Math.floor((Date.now() - then.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
