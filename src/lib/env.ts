import { z } from "zod";

/**
 * Public environment variables, validated once at startup.
 *
 * Only NEXT_PUBLIC_* values belong here: they are safe to ship to the
 * browser. Server-only secrets (none are needed yet) must live in a
 * separate server-only module and never be imported by client code.
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a full URL, e.g. https://abc.supabase.co" })
    .refine((value) => value.startsWith("https://") || value.startsWith("http://127.0.0.1") || value.startsWith("http://localhost"), {
      message: "NEXT_PUBLIC_SUPABASE_URL must use https (http is allowed only for a local Supabase)",
    }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(20, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY looks too short; copy it from Supabase → Project Settings → API Keys")
    .refine((value) => !value.startsWith("sb_secret_"), {
      message: "That is a SECRET key. Use the publishable key (sb_publishable_...) or the legacy anon key here.",
    }),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export class MissingEnvError extends Error {
  constructor(issues: string[]) {
    super(
      `Perqly is missing or has invalid environment variables:\n- ${issues.join("\n- ")}\nSee .env.example and README.md → Environment variables.`,
    );
    this.name = "MissingEnvError";
  }
}

/** Parses an env-like object. Exported separately so it can be unit tested. */
export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new MissingEnvError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  return result.data;
}

/**
 * Reads the public env. Each NEXT_PUBLIC_* variable is referenced explicitly
 * so Next.js can inline it into browser bundles.
 */
export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

/** True when Supabase has been configured. The public site works without it. */
export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
