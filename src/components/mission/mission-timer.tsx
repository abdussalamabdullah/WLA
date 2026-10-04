"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * TIMED STAGES and CHECKPOINTS (Enhancement Plan §3, §5).
 *
 * The SERVER owns time: `view.timerSeconds` and `view.waitSeconds` are
 * computed from server-recorded marks, and `timer_expired` is accepted only
 * once server time agrees (runtime.ts). This component only shows the time
 * and says when it is up; a fast or tampered device clock changes nothing.
 */

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function MissionTimer({ seconds, visible, onExpire }: { seconds: number; visible: boolean; onExpire: () => void }) {
  const [left, setLeft] = useState(seconds);
  const [said, setSaid] = useState<string>("");
  const fired = useRef(false);
  const start = useRef(0);
  // The latest callback, without restarting the count when it changes identity.
  const expire = useRef(onExpire);
  useEffect(() => { expire.current = onExpire; }, [onExpire]);

  useEffect(() => {
    // A new deadline from the server restarts the count from now.
    start.current = Date.now();
    fired.current = false;
    const id = setInterval(() => {
      const n = Math.max(0, seconds - Math.floor((Date.now() - start.current) / 1000));
      setLeft(n);
      // Announce sparingly: a ticking live region is noise (WCAG 2.2.2 spirit).
      if (n === 60) setSaid("One minute left.");
      if (n === 10) setSaid("Ten seconds left.");
      // Once, a moment after the deadline. The server accepts it within a
      // small tolerance (runtime.ts), so there is nothing to retry — and a
      // retry after the run has moved on would be a stale step.
      if (n === 0 && !fired.current && Date.now() - start.current >= seconds * 1000 + 500) {
        fired.current = true;
        setSaid("Time is up.");
        expire.current();
      }
    }, 500);
    return () => clearInterval(id);
  }, [seconds]);

  return (
    <>
      {visible && (
        <p role="timer" aria-label="Time left" className="inline-flex items-center gap-[var(--space-xs)] self-start rounded-[var(--radius-control)] border border-[var(--color-border)] px-[var(--space-s)] py-[var(--space-xs)] text-[length:var(--text-label)] tabular-nums">
          <span aria-hidden>⏱</span>
          {left > 0 ? `${mmss(left)} left` : "Time is up"}
        </p>
      )}
      <p className="sr-only" aria-live="polite">{said}</p>
    </>
  );
}

const when = (s: number) => {
  const d = new Date(Date.now() + s * 1000);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  return sameDay ? `at ${time}` : `on ${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${time}`;
};

/** A stage that opens after a real-world interval: calm, with the way back. */
export function CheckpointWait({ seconds, missionSlug, title }: { seconds: number; missionSlug: string; title?: string | null }) {
  return (
    <div className="flex flex-col gap-[var(--space-l)]">
      <h2 className="text-[length:var(--text-h1)]">{title || "The next part isn’t ready yet"}</h2>
      <p className="wla-measure">
        This part of the mission opens {when(seconds)}. Your place is saved — come back then and it will be waiting.
      </p>
      <div>
        <Link href={`/academy/missions/${missionSlug}`}
          className="inline-flex min-h-[var(--target-min)] items-center rounded-[var(--radius-button)] border border-[var(--color-border-strong)] px-[var(--space-l)] text-[length:var(--text-label)]">
          Back to Mission Home
        </Link>
      </div>
    </div>
  );
}
