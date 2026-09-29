"use client";

import { useEffect } from "react";
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
 *
 * OPS-01: the child sees none of this, and we still have to. The boundary
 * reports itself — name and Next's opaque digest only, never the message —
 * so a failure here is observable without the interface ever explaining it.
 *
 * RETRY, NOT RESET. In this Next version `reset()` re-renders WITHOUT
 * re-fetching, so after a server-side failure (an unreachable database, see
 * ServiceUnavailableError) "Try Again" just showed the same error. `retry()`
 * re-fetches. The fallback replaces the page, so it owns the h1.
 */
export default function AcademyError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    void fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boundary: "academy", digest: error.digest }),
      keepalive: true,
    }).catch(() => {
      // Reporting a failure must never cause one.
    });
  }, [error.digest]);

  return (
    <main className="wla-container py-[var(--space-2xl)]">
      <ErrorState
        title="Something went wrong."
        body="Your mission progress is safe. Please try again."
        onRetry={() => retry()}
        as="h1"
      />
    </main>
  );
}
