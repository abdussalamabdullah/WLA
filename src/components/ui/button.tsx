import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * UI/UX §48–§49. Three variants only — the spec warns against "five visually
 * equal buttons on one screen".
 *
 * Loading preserves button dimensions (§49: "Do not allow layout jumping").
 */

type Variant = "primary" | "secondary" | "text";
type Size = "default" | "large";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-[var(--color-primary-text)] hover:bg-[var(--color-primary-hover)] border border-transparent",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-sage)]",
  // Charcoal, not olive: this is small text on cream, and the colour
  // application rule reserves olive for larger emphasis and buttons.
  text: "bg-transparent text-[var(--color-text-action)] border border-transparent underline decoration-[var(--color-border-strong)] underline-offset-4 hover:decoration-[var(--color-primary)] px-0",
};

const sizes: Record<Size, string> = {
  // min-height meets the §63 touch target floor
  default:
    "min-h-[var(--target-min)] px-[var(--space-l)] text-[var(--text-label)]",
  large: "min-h-[52px] px-[var(--space-xl)] text-[var(--text-body)]",
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
          "inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)]",
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
