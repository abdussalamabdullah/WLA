import { AcademyShell } from "@/components/academy/academy-shell";

export const metadata = { title: "Mission Board" };

/**
 * MISSION BOARD — C5, and the C8 naming trap.
 *
 * The LMS brief places "Mission Board" in the parent and child sidebars but
 * specifies no behaviour for it. Architecture §22 still defers submission,
 * moderation, likes, comments and ranking, and D-56 did not lift that.
 *
 * So this is a signposted destination and nothing more. It deliberately does
 * NOT collect, display or rank any learner's work. Do not add contents here
 * without a written specification — see C5 in docs/DECISIONS.md.
 *
 * This is the Academy-wide Mission Board (Architecture §16), NOT the Six Names
 * printable worksheet of the same name (C8). They are unrelated.
 */
export default function MissionBoardPage() {
  return (
    <AcademyShell>
      <main className="wla-container py-[var(--space-2xl)]">
        <h1 className="text-[length:var(--text-h1)]">Mission Board</h1>
        <p className="mt-[var(--space-m)] wla-measure text-[var(--color-text-muted)]">
          A place to see selected WLA practice from other learners. Anonymised,
          optional, and shared only with a parent&rsquo;s permission.
        </p>
        <p className="mt-[var(--space-m)] wla-measure text-[var(--color-text-muted)]">
          It isn&rsquo;t open yet. Your Mission Trail stays private in the
          meantime.
        </p>
      </main>
    </AcademyShell>
  );
}
