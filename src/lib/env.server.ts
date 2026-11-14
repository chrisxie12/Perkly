import "server-only";
import { z } from "zod";

/**
 * Server-only settings. Never import this from a client component, and never
 * prefix these with NEXT_PUBLIC_. All are optional: features that need them
 * switch themselves off when they're missing (docs/SUPABASE_SETUP.md §5).
 */
const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z
    .string()
    .refine((value) => value.startsWith("sb_secret_"), "SUPABASE_SECRET_KEY must be a secret key (sb_secret_...)")
    .optional(),
  RESEND_API_KEY: z
    .string()
    .refine((value) => value.startsWith("re_"), "RESEND_API_KEY must start with re_")
    .optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  const blankToUndefined = (value: string | undefined) => (value && value.trim() !== "" ? value.trim() : undefined);
  return serverEnvSchema.parse({
    SUPABASE_SECRET_KEY: blankToUndefined(process.env.SUPABASE_SECRET_KEY),
    RESEND_API_KEY: blankToUndefined(process.env.RESEND_API_KEY),
    RESEND_FROM_EMAIL: blankToUndefined(process.env.RESEND_FROM_EMAIL),
    CRON_SECRET: blankToUndefined(process.env.CRON_SECRET),
  });
}

/** Institutional-email confirmation needs the secret key (to issue codes) and Resend (to send them). */
export function isInstitutionalEmailConfirmationEnabled(): boolean {
  const env = getServerEnv();
  return Boolean(env.SUPABASE_SECRET_KEY && env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
}

/** Decision emails need the secret key (to look up the student's email) and Resend. */
export function isDecisionEmailEnabled(): boolean {
  return isInstitutionalEmailConfirmationEnabled();
}
