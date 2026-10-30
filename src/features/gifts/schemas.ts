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
