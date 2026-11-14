"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage, isUnknownAccountError } from "@/lib/auth/messages";
import { getRequestOrigin } from "@/lib/auth/origin";
import { safeNextPath } from "@/lib/auth/paths";
import { requiresTwoFactor } from "@/lib/auth/roles";
import { getUserContext } from "@/lib/auth/session";
import { codeSchema, fieldErrors, signInSchema, signUpSchema, totpSchema } from "./schemas";
import type { FormState, TotpEnrollment } from "./types";

const PENDING_COOKIE = "perqly_pending_signin";
const PENDING_MAX_AGE = 10 * 60;

type PendingSignIn = { email: string; mode: "sign-in" | "sign-up" };

async function setPending(pending: PendingSignIn) {
  (await cookies()).set(PENDING_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_MAX_AGE,
  });
}

async function getPending(): Promise<PendingSignIn | null> {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingSignIn;
    if (typeof value.email === "string" && (value.mode === "sign-in" || value.mode === "sign-up")) return value;
  } catch {
    // Ignore a malformed cookie.
  }
  return null;
}

const notConfigured: FormState = {
  status: "error",
  message: "Sign-in isn't available in this environment yet.",
};

function codePage(next: string | null) {
  return next ? `/login/code?next=${encodeURIComponent(next)}` : "/login/code";
}

/** Sends a one-time code to an existing account. Never reveals whether the account exists. */
export async function requestSignInCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), next: formData.get("next") ?? undefined });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return notConfigured;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await getRequestOrigin()}/auth/confirm` },
  });
  if (error && !isUnknownAccountError(error.code)) {
    return { status: "error", message: authErrorMessage(error.code) };
  }

  await setPending({ email: parsed.data.email, mode: "sign-in" });
  redirect(codePage(safeNextPath(parsed.data.next)));
}

/** Creates an account (or signs in an existing one) and sends a one-time code. */
export async function requestSignUpCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    intent: formData.get("intent"),
    consent: formData.get("consent"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return notConfigured;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      data: { full_name: parsed.data.fullName.replace(/\s+/g, " "), signup_intent: parsed.data.intent },
      emailRedirectTo: `${await getRequestOrigin()}/auth/confirm`,
    },
  });
  if (error) return { status: "error", message: authErrorMessage(error.code) };

  await setPending({ email: parsed.data.email, mode: "sign-up" });
  const next = safeNextPath(parsed.data.next) ?? (parsed.data.intent === "merchant" ? "/merchant" : null);
  redirect(codePage(next));
}

/** Checks the 6-digit code and starts the session. */
export async function verifySignInCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = codeSchema.safeParse({ code: formData.get("code"), next: formData.get("next") ?? undefined });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return notConfigured;

  const pending = await getPending();
  if (!pending) {
    return { status: "error", message: "Your sign-in timed out. Enter your email again to get a new code." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: pending.email, token: parsed.data.code, type: "email" });
  if (error) return { status: "error", fieldErrors: { code: authErrorMessage(error.code) } };

  (await cookies()).delete(PENDING_COOKIE);
  const next = safeNextPath(parsed.data.next);
  redirect(next ? `/auth/continue?next=${encodeURIComponent(next)}` : "/auth/continue");
}

/** Sends a fresh code to the email from the current attempt. */
export async function resendSignInCode(): Promise<FormState> {
  if (!hasSupabaseEnv()) return notConfigured;
  const pending = await getPending();
  if (!pending) {
    return { status: "error", message: "Your sign-in timed out. Enter your email again to get a new code." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: pending.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await getRequestOrigin()}/auth/confirm` },
  });
  if (error && !isUnknownAccountError(error.code)) return { status: "error", message: authErrorMessage(error.code) };

  await setPending(pending);
  return { status: "success", message: "We've sent a new code. Use the most recent email." };
}

export async function signOut(): Promise<void> {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

/** Starts authenticator-app (TOTP) setup and returns the QR code to scan. */
export async function startTotpEnrollment(): Promise<{ ok: true; enrollment: TotpEnrollment } | { ok: false; message: string }> {
  if (!hasSupabaseEnv()) return { ok: false, message: notConfigured.message! };
  const ctx = await getUserContext();
  if (!ctx || !requiresTwoFactor(ctx)) return { ok: false, message: "Your account doesn't need two-step verification." };
  const supabase = await createClient();

  // Remove abandoned, unverified setups so a fresh one can start.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Perqly ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { ok: false, message: authErrorMessage(error?.code, "Couldn't start authenticator setup. Try again.") };
  return { ok: true, enrollment: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } };
}

/** Verifies a code from the authenticator app, completing setup or a sign-in challenge. */
export async function verifyTotp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = totpSchema.safeParse({
    factorId: formData.get("factorId"),
    code: formData.get("code"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return notConfigured;

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) return { status: "error", fieldErrors: { code: authErrorMessage(error.code) } };

  const next = safeNextPath(parsed.data.next);
  redirect(next ? `/auth/continue?next=${encodeURIComponent(next)}` : "/auth/continue");
}
