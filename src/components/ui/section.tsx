import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * THE SPLIT SECTION — the public site's governing layout idea.
 *
 * Measured from ten captures of the public site: nearly every section is a
 * Fraunces heading in columns 1–5 of a 12-column, 32px-gutter grid, with all
 * of its content in columns 6–12. The left column is mostly empty and that
 * emptiness is the composition. See docs/DESIGN-LANGUAGE §5.
 *
 * The Academy previously stacked a heading above full-width content on every
 * screen, which is the generic arrangement and reads as a different product.
 *
 * Below `lg` the columns stack, heading first — the captures are all 1512px
 * wide, so the site's own small-screen behaviour could not be measured and
 * this is the conventional reading order rather than an observed one.
 */
export function SplitSection({
  heading,
  deck,
  children,
  band = "none",
  className,
  headingLevel: Heading = "h2",
  headingId,
}: {
  heading: React.ReactNode;
  /** The short explanatory line the site sets under most section headings. */
  deck?: React.ReactNode;
  children: React.ReactNode;
  /** Full-bleed background. The site alternates cream and sage. */
  band?: "none" | "sage" | "raised";
  className?: string;
  headingLevel?: "h1" | "h2";
  headingId?: string;
}) {
  return (
    <section
      className={cn(
        "wla-section",
        band === "sage" && "wla-band-sage",
        band === "raised" && "wla-band-raised",
        className,
      )}
    >
      <div className="wla-container wla-split">
        <div className="lg:col-span-5">
          <Heading
            id={headingId}
            className={cn(
              Heading === "h1"
                ? "text-[length:var(--text-h1)]"
                : "text-[length:var(--text-h1)]",
            )}
          >
            {heading}
          </Heading>
          {deck && (
            <p className="wla-measure mt-[var(--space-m)] text-[var(--color-text-muted)]">
              {deck}
            </p>
          )}
        </div>
        <div className="lg:col-span-7">{children}</div>
      </div>
    </section>
  );
}

/**
 * A page's opening block: title, optional editorial line, optional meta.
 *
 * Not a hero — the Academy is a place to work, not a page to be sold to, and
 * the site's 60px display type belongs to the public marketing surface. This
 * uses the h1 step (37px) and leaves `wla-display` for the one Academy screen
 * that earns it: mission completion.
 */
export function PageHeader({
  title,
  deck,
  editorial,
  meta,
  actions,
  className,
}: {
  title: React.ReactNode;
  deck?: React.ReactNode;
  /** Fraunces italic in olive. At most one per screen — see .wla-editorial. */
  editorial?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("wla-split", className)}>
      <div className="lg:col-span-7">
        <h1 className="text-[length:var(--text-h1)]">{title}</h1>
        {editorial && (
          <p className="wla-editorial mt-[var(--space-m)] text-[length:var(--text-body-lg)]">
            {editorial}
          </p>
        )}
        {deck && (
          <p className="wla-measure mt-[var(--space-m)] text-[var(--color-text-muted)]">
            {deck}
          </p>
        )}
        {meta && <div className="mt-[var(--space-m)]">{meta}</div>}
      </div>
      {actions && (
        <div className="lg:col-span-5 lg:flex lg:items-start lg:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Dot-separated metadata, set the way the site sets it.
 *
 * "Decision Lab · Ages 11–15 · Hybrid". The middots carry air on either side
 * (--space-meta) so the parts read as separate facts rather than one run-on
 * string, and they are aria-hidden so a screen reader hears the facts and not
 * the punctuation.
 */
export function MetaList({
  items,
  leading,
  className,
}: {
  items: (string | null | undefined)[];
  /** The Lab icon slot — see LabIcon. */
  leading?: React.ReactNode;
  className?: string;
}) {
  const parts = items.filter((v): v is string => Boolean(v));

  return (
    <p
      className={cn(
        "flex flex-wrap items-center text-[length:var(--text-small)] text-[var(--color-text-muted)]",
        className,
      )}
    >
      {leading && (
        <span className="mr-[var(--space-s)] shrink-0">{leading}</span>
      )}
      {parts.map((part, i) => (
        <span key={part}>
          {i > 0 && (
            <span
              aria-hidden
              className="mx-[var(--space-meta)] text-[var(--color-border-strong)]"
            >
              ·
            </span>
          )}
          {part}
        </span>
      ))}
    </p>
  );
}

/**
 * A hairline-separated list — the site's structure for FAQs and any sequence
 * of peer items. It uses a rule where a generic design would use a card.
 */
export function RuledList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "border-t border-[var(--color-border)] [&>li]:border-b [&>li]:border-[var(--color-border)]",
        className,
      )}
    >
      {children}
    </ul>
  );
}
