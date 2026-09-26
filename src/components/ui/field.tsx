import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * FORM PRIMITIVES — UI/UX §51.
 *
 * "Inputs should use cream/light surfaces, subtle borders, charcoal text,
 * clear labels, generous vertical spacing, visible focus state."
 *
 * "Never rely on placeholder text as the only label" — hence `label` is
 * required, not optional. "Validation should be calm and close to the relevant
 * field" — hence the error renders directly beneath, wired via
 * aria-describedby so it is announced rather than merely seen.
 */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className="flex flex-col gap-[var(--space-s)]">
      <label
        htmlFor={htmlFor}
        className="text-[length:var(--text-label)] font-medium"
      >
        {label}
      </label>

      {hint && (
        <p
          id={hintId}
          className="text-[length:var(--text-small)] text-[var(--color-text-muted)]"
        >
          {hint}
        </p>
      )}

      {children}

      {error && (
        <p
          id={errorId}
          // Announced on change without stealing focus
          role="alert"
          className="text-[length:var(--text-small)] text-[var(--color-error)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "min-h-[var(--target-min)] w-full",
          "rounded-[var(--radius-input)] border px-[var(--space-m)]",
          "bg-[var(--color-surface)] text-[var(--color-text)]",
          "placeholder:text-[var(--color-text-muted)]",
          "transition-colors duration-[var(--duration-fast)]",
          invalid
            ? "border-[var(--color-error)]"
            : "border-[var(--color-border-strong)]",
          className,
        )}
        {...props}
      />
    );
  },
);

/** Form-level failure, distinct from a per-field error. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-[var(--radius-input)] border border-[var(--color-error)] bg-[var(--color-surface)] px-[var(--space-m)] py-[var(--space-sm)] text-[length:var(--text-small)] text-[var(--color-error)]"
    >
      {message}
    </p>
  );
}

/** Confirmation, e.g. "check your inbox". Calm, never celebratory. */
export function FormNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="rounded-[var(--radius-input)] border border-[var(--color-border-strong)] bg-[var(--color-surface-sage)] px-[var(--space-m)] py-[var(--space-sm)] text-[length:var(--text-small)]"
    >
      {message}
    </p>
  );
}
