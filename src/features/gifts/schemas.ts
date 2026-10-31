import { z } from "zod";

export const recipientEmailSchema = z
  .string()
  .trim()
  .min(1, "Enter the recipient's email address.")
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.");

export const confirmEmailSchema = z
  .string()
  .trim()
  .min(1, "Enter the email address this gift was sent to.")
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.");

/** Eight characters, however it was typed: spaces, a hyphen, lower case. */
export const giftCodeSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, "").toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{8}$/, "Enter the eight-character code from the email."));
