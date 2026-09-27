import * as React from "react";
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

const variants: Record<Variant, string> = {
  // The one pill on the page. Its label is a near-white warm tint rather than
  // the canvas cream, which is what holds it at 5.36:1 on olive.
  primary:
    "rounded-[var(--radius-button)] bg-[var(--color-primary)] text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)] border border-transparent",
  secondary:
    "rounded-[var(--radius-control)] bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-raised)]",
  // Charcoal, not olive: this is small text on cream, and the colour
  // application rule reserves olive for larger emphasis and buttons.
  text: "rounded-[var(--radius-control)] bg-transparent text-[var(--color-text-action)] border border-transparent underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)] px-0",
};

const sizes: Record<Size, string> = {
  /*
   * min-height meets the §63 touch target floor. A DELIBERATE DIVERGENCE:
   * the site's own header control measures 31px, but the Academy's audience
   * is 7–15 and 44px is an accessibility requirement, not a preference.
   */
  default:
    "min-h-[var(--target-min)] px-[var(--space-l)] text-[var(--text-label)]",
  // 48px is the site's measured primary CTA height.
  large: "min-h-[48px] px-[var(--space-xl)] text-[var(--text-body)]",
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
