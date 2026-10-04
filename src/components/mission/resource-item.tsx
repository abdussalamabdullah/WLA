import { cn } from "@/lib/utils";


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
/**
 * One Kit item, for either actor.
 *
 * `href` is a signed, short-lived URL for a parent and a link to the
 * re-authorising handler for a child (D-64). Never a permanent public URL
 * (Tech Spec §47), and never a storage path.
 */
export type KitItem = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  canView: boolean;
  canPrint: boolean;
  canDownload: boolean;
  href: string | null;
};

/** Stable in-page anchor for a Kit resource, from its title. */
export function kitAnchor(title: string): string {
  return `resource-${title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function ResourceItem({
  item,
  unavailable = false,
}: {
  item: KitItem;
  unavailable?: boolean;
}) {
  const disabled = unavailable || !item.href;
  const url = item.href;

  return (
    // The anchor a Kit QR code opens (`/q/...` → `#resource-<title>`, Plan §5).
    <li id={kitAnchor(item.title)} className="scroll-mt-[var(--space-xl)] border-b border-[var(--color-border)] py-[var(--space-l)] last:border-b-0">
      {/* h2, not h3: a Kit resource is a section of the Mission Kit page, whose h1 is "Mission Kit". Jumping h1 → h3 skips a level (WCAG 1.3.1). */}
      <h2 className="text-[length:var(--text-h3)]">{item.title}</h2>
      {item.description && (
        <p className="wla-measure mt-[var(--space-xs)] text-[length:var(--text-small)] text-[var(--color-text-muted)]">
          {item.description}
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
          {item.canView && (
            <ResourceAction href={url!} label="View" target="_blank" />
          )}
          {item.canPrint && (
            <ResourceAction href={url!} label="Print" target="_blank" />
          )}
          {item.canDownload && (
            <ResourceAction href={url!} label="Download" download />
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
