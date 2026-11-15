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
  // Phone notifications (web push). Generate the pair with `npx web-push generate-vapid-keys`;
  // the public half goes in NEXT_PUBLIC_VAPID_PUBLIC_KEY.
  VAPID_PRIVATE_KEY: z.string().min(40, "VAPID_PRIVATE_KEY looks too short").optional(),
  // Merchant billing (D18). sk_test_... while testing, sk_live_... once Paystack is activated.
  PAYSTACK_SECRET_KEY: z
    .string()
    .regex(/^sk_(test|live)_[A-Za-z0-9]{20,}$/, "PAYSTACK_SECRET_KEY should start with sk_test_ or sk_live_")
    .optional(),
  VAPID_SUBJECT: z
    .string()
    .refine((value) => /^(mailto:|https:\/\/)/.test(value), "VAPID_SUBJECT must be mailto:you@example.com or an https URL")
    .optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  const blankToUndefined = (value: string | undefined) => (value && value.trim() !== "" ? value.trim() : undefined);
  return serverEnvSchema.parse({
    SUPABASE_SECRET_KEY: blankToUndefined(process.env.SUPABASE_SECRET_KEY),
    RESEND_API_KEY: blankToUndefined(process.env.RESEND_API_KEY),
    RESEND_FROM_EMAIL: blankToUndefined(process.env.RESEND_FROM_EMAIL),
    CRON_SECRET: blankToUndefined(process.env.CRON_SECRET),
    VAPID_PRIVATE_KEY: blankToUndefined(process.env.VAPID_PRIVATE_KEY),
    VAPID_SUBJECT: blankToUndefined(process.env.VAPID_SUBJECT),
    PAYSTACK_SECRET_KEY: blankToUndefined(process.env.PAYSTACK_SECRET_KEY),
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

/** Phone notifications need both halves of the VAPID key pair and the secret key (to read the queue). */
export function isPushEnabled(): boolean {
  const env = getServerEnv();
  return Boolean(env.SUPABASE_SECRET_KEY && env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim());
}
