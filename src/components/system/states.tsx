import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * SYSTEM STATES — UI/UX §53–§56, Brief §40, Tech Spec §44.
 *
 * The Designer Brief is emphatic that these be resolved rather than left for
 * development to invent. They live here so every screen uses the same ones.
 */

/** §53 — loading should feel quiet. Skeletons, not spinners. */
export function LoadingState({
  label = "Loading…",
  lines = 3,
  className,
}: {
  label?: string;
  lines?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col gap-[var(--space-sm)]", className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className="h-4 rounded-[var(--radius-input)] bg-[var(--color-border)] opacity-50"
          style={{ width: `${100 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

/** §54 — explain what happened and what to do next. Must not look like an error. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-start gap-[var(--space-m)] py-[var(--space-3xl)]">
      <h2 className="text-[length:var(--text-h2)]">{title}</h2>
      {body && (
        <p className="wla-measure text-[var(--color-text-muted)]">{body}</p>
      )}
      {/*
        An empty screen is an invitation to act, so its action is the page's
        one olive pill rather than a bordered control — the public site keeps
        outline buttons out of a page body entirely.
      */}
      {action && (
        <a href={action.href}>
          <Button>{action.label}</Button>
        </a>
      )}
    </div>
  );
}

/**
 * §55 — explain simply, preserve context, offer an action.
 * Never surface raw messages like "Error 500: failed to fetch mission_state".
 */
export function ErrorState({
  title = "Something went wrong.",
  body = "Please try again.",
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-[var(--space-m)] py-[var(--space-2xl)]"
    >
      <h2 className="text-[length:var(--text-h3)]">{title}</h2>
      <p className="wla-measure text-[var(--color-text-muted)]">{body}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}

/**
 * §56 — unavailable is NOT an error. It must reassure that progress is safe,
 * which is the difference that matters to a child mid-mission.
 */
export function UnavailableState({
  title = "This isn't available right now.",
  onRetry,
}: {
  title?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-[var(--space-m)] py-[var(--space-2xl)]">
      <h2 className="text-[length:var(--text-h3)]">{title}</h2>
      <p className="wla-measure text-[var(--color-text-muted)]">
        Your mission progress is safe.
      </p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
}

/**
 * Brief §40 — "Restoring": shown while saved mission state is being rebuilt.
 * Distinct from ordinary loading because it reassures about persistence.
 */
export function RestoringState() {
  return (
    <div role="status" aria-live="polite" className="py-[var(--space-2xl)]">
      <p className="text-[var(--color-text-muted)]">
        Picking up where you left off…
      </p>
    </div>
  );
}
