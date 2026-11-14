import { z } from "zod";

export const emailSchema = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .min(3, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email({ error: "Enter a valid email address." }));

export const signInSchema = z.object({
  email: emailSchema,
  next: z.string().max(512).optional(),
});

export const signUpSchema = z.object({
  fullName: z
    .string({ error: "Enter your full name." })
    .trim()
    .min(2, "Enter your full name.")
    .max(120, "Use 120 characters or fewer.")
    .regex(/^[\p{L}\p{M}' .-]+$/u, "Use letters, spaces, hyphens and apostrophes only."),
  email: emailSchema,
  intent: z.enum(["student", "merchant"], { error: "Choose whether you're a student or run a business." }),
  consent: z.literal("on", { error: "Agree to the terms and privacy notice to continue." }),
  next: z.string().max(512).optional(),
});

export const codeSchema = z.object({
  code: z
    .string({ error: "Enter the 6-digit code." })
    .transform((value) => value.replace(/\s|-/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from the email.")),
  next: z.string().max(512).optional(),
});

export const totpSchema = z.object({
  factorId: z.string().min(1).max(64),
  code: z
    .string({ error: "Enter the 6-digit code." })
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.")),
  next: z.string().max(512).optional(),
});

/** First error message per field, for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
