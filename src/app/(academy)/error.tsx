"use client";

import { ErrorState } from "@/components/system/states";

/**
 * Academy error boundary — UI/UX §55.
 *
 * "Avoid technical error messages such as Error 500: failed to fetch
 * mission_state." So the thrown error is deliberately NOT rendered; the child
 * gets plain language and a way forward.
 *
 * The reassurance matters: mission state is server-authoritative, so a render
 * failure genuinely has not lost their place, and saying so is true.
 */
export default function AcademyError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wla-container py-[var(--space-2xl)]">
      <ErrorState
        title="Something went wrong."
        body="Your mission progress is safe. Please try again."
        onRetry={reset}
      />
    </main>
  );
}
