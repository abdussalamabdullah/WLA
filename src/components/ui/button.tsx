import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * UI/UX §48–§49. Three variants only — the spec warns against "five visually
 * equal buttons on one screen".
 *
 * SHAPE IS NOT UNIFORM, and that is measured rather than stylistic. On the
 * public site the primary CTA is a true pill (its corner radius is half its
 * 48px height) while the header's secondary control is a rounded rectangle at
 * about 4px. Making every button a pill — as the Academy did — erased the
 * distinction the site uses to tell a page's one real action apart from the
 * controls around it. See docs/DESIGN-LANGUAGE §4.
 *
 * The site has no outline button anywhere in a page body; below the header,
 * every secondary action is a text link. Prefer `text` and keep `secondary`
 * for form and header chrome.
 *
 * Loading preserves button dimensions (§49: "Do not allow layout jumping").
 */

type Variant = "primary" | "secondary" | "text";
type Size = "default" | "large";

/*
 * EVERY arbitrary `text-[…]` utility here carries an explicit `color:` or
 * `length:` hint, and that is load-bearing rather than pedantic.
 *
 * `cn()` is tailwind-merge. Given `text-[var(--color-primary-text)]` from a
 * variant and `text-[var(--text-body)]` from a size, it cannot tell which is a
 * colour and which is a size, treats them as the same utility group, and keeps
 * only the last — silently dropping the colour before it ever reaches the
 * stylesheet. The primary button therefore rendered its label in inherited
 * charcoal on olive: 2.26:1, and visibly wrong against the site.
 *
 * The hint tells tailwind-merge they are different properties, so both
 * survive. Every other file in this codebase already writes
 * `text-[length:var(--text-…)]`; these two were the exceptions.
 */
const variants: Record<Variant, string> = {
  // The one pill on the page. Its label is the site's soft warm cream —
  // 5.04:1 on olive at rest, 7.23:1 on hover.
  primary:
    "rounded-[var(--radius-button)] bg-[var(--color-primary)] text-[color:var(--color-primary-text)] hover:bg-[var(--color-primary-hover)] border border-transparent",
  secondary:
    "rounded-[var(--radius-control)] bg-[var(--color-surface)] text-[color:var(--color-text)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-raised)]",
  // Charcoal, not olive: this is small text on cream, and the colour
  // application rule reserves olive for larger emphasis and buttons.
  text: "rounded-[var(--radius-control)] bg-transparent text-[color:var(--color-text-action)] border border-transparent underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)] px-0",
};

const sizes: Record<Size, string> = {
  /*
   * min-height meets the §63 touch target floor. A DELIBERATE DIVERGENCE:
   * the site's own header control measures 31px, but the Academy's audience
   * is 7–15 and 44px is an accessibility requirement, not a preference.
   */
  default:
    "min-h-[var(--target-min)] px-[var(--space-l)] text-[length:var(--text-label)]",
  /*
   * MEASURED from the site's hero CTA at full resolution: 48px tall, about
   * 28px of horizontal padding, label at 16px. It was 32px padding and an 18px
   * label, which made the pill noticeably larger than the site's for the same
   * words.
   */
  large: "min-h-[48px] px-[28px] text-[length:var(--text-button)]",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  loadingLabel?: string;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      size = "default",
      isLoading = false,
      loadingLabel = "Working…",
      disabled,
      children,
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        // §62: state must be announced, not just shown
        aria-busy={isLoading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          "font-medium transition-colors",
          "duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {isLoading ? loadingLabel : children}
      </button>
    );
  },
);

/**
 * A LINK that looks like a button.
 *
 * Wrapping a <Button> in a <Link> nests interactive content inside interactive
 * content: invalid HTML, and a real accessibility defect. A screen reader
 * announces two controls where there is one thing to do, and the anchor's own
 * hit area collapses to the inline text box while the button inside keeps the
 * 48px — which is how the audit found it, as a 211×22 target sitting around a
 * correctly sized one.
 *
 * Navigation that should LOOK like the primary action uses this instead. It is
 * an anchor, so it navigates, opens in a new tab on the usual modifiers, and
 * announces itself as a link rather than a button.
 */
export function ButtonLink({
  href,
  variant = "primary",
  size = "default",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "className"> & {
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2",
        "font-medium transition-colors",
        "duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
