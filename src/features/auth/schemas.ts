import { z } from "zod";

/**
 * Auth input validation (Tech Spec §47: "Validate and sanitise user-generated
 * input where appropriate").
 *
 * Deliberately minimal — PRD §8: "Do not build unnecessary authentication
 * methods or identity providers at MVP stage."
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .email("That doesn't look like an email address.");

/**
 * 8 characters minimum. Supabase's own floor is 6; we ask for a little more
 * without imposing composition rules, which push people toward weaker,
 * more-forgettable passwords.
 */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Passwords can be at most 72 characters.");

export const signUpSchema = z.object({
  name: z.string().trim().max(80).optional().or(z.literal("")),
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const resetRequestSchema = z.object({ email: emailSchema });

export const newPasswordSchema = z.object({ password: passwordSchema });

export type FormState = {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
};

export const emptyFormState: FormState = {};

/** Flatten a zod error into one message per field. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}
