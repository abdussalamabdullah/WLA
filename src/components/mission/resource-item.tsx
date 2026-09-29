import { cn } from "@/lib/utils";
import type { MissionResourceRow } from "@/types/database";

/**
 * MISSION KIT RESOURCE — Architecture §7, UI/UX §30–§31.
 *
 * §30: "Resources should be presented as intentional mission materials rather
 * than generic downloads" and "Only show actions that actually apply."
 *
 * HARD RULE (Architecture §7): view, print and download must NOT alter mission
 * progress. Nothing here may write progress, and nothing here may be wired to
 * a handler that does.
 */
export function ResourceItem({
  resource,
  url,
  unavailable = false,
}: {
  resource: MissionResourceRow;
  /** Signed, short-lived URL. Never a permanent public URL (Tech Spec §47). */
  url: string | null;
  unavailable?: boolean;
}) {
  const disabled = unavailable || !url;

  return (
    <li className="border-b border-[var(--color-border)] py-[var(--space-l)] last:border-b-0">
      {/* h2, not h3: a Kit resource is a section of the Mission Kit page, whose h1 is "Mission Kit". Jumping h1 → h3 skips a level (WCAG 1.3.1). */}
      <h2 className="text-[length:var(--text-h3)]">{resource.title}</h2>
      {resource.description && (
        <p className="wla-measure mt-[var(--space-xs)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {resource.description}
        </p>
      )}

      {disabled ? (
        // UI/UX §56 — unavailable must reassure, not alarm
        <p className="mt-[var(--space-sm)] text-[length:var(--text-label)] text-[var(--color-text-muted)]">
          This resource isn&rsquo;t available right now. Your mission progress
          is safe.
        </p>
      ) : (
        <ul className="mt-[var(--space-sm)] flex flex-wrap gap-[var(--space-l)]">
          {resource.can_view && (
            <ResourceAction href={url} label="View" target="_blank" />
          )}
          {resource.can_print && (
            <ResourceAction href={url} label="Print" target="_blank" />
          )}
          {resource.can_download && (
            <ResourceAction href={url} label="Download" download />
          )}
        </ul>
      )}
    </li>
  );
}

function ResourceAction({
  href,
  label,
  target,
  download,
}: {
  href: string;
  label: string;
  target?: string;
  download?: boolean;
}) {
  return (
    <li>
      <a
        href={href}
        target={target}
        rel={target ? "noreferrer" : undefined}
        download={download}
        className={cn(
          "inline-flex min-h-[var(--target-min)] items-center",
          "text-[length:var(--text-label)] font-medium",
          "underline decoration-[var(--color-border-strong)] underline-offset-4",
          "hover:decoration-[var(--color-primary)]",
        )}
      >
        {label}
      </a>
    </li>
  );
}
