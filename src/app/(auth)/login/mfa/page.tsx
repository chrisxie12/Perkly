import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoadingIndicator } from "@/components/shared/states";
import { getUserContext } from "@/lib/auth/session";
import { loginPath } from "@/lib/auth/paths";
import { requiresTwoFactor } from "@/lib/auth/roles";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AuthCard } from "@/features/auth/components/auth-card";
import { TotpChallenge, TotpSetup } from "@/features/auth/components/totp-forms";

export const metadata: Metadata = { title: "Two-step verification", robots: { index: false } };

async function MfaStep() {
  const ctx = await getUserContext();
  if (!ctx) redirect(loginPath("/auth/continue"));

  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp.find((factor) => factor.status === "verified");

  // Only staff and institution admins set this up. Anyone else who lands here
  // (an old link, a typed URL) is sent on rather than shown a staff-only screen.
  if (!verified && !requiresTwoFactor(ctx)) {
    return (
      <>
        <p className="mb-6 text-lg leading-relaxed text-ink-600">Your account doesn&apos;t need two-step verification.</p>
        <Link href="/auth/continue" className="font-semibold text-blue-600 underline underline-offset-2">
          Continue to Perqly
        </Link>
      </>
    );
  }

  if (verified) {
    return (
      <>
        <p className="mb-6 text-lg leading-relaxed text-ink-600">Open your authenticator app and enter the current code for Perqly.</p>
        <TotpChallenge factorId={verified.id} />
      </>
    );
  }
  return (
    <>
      <p className="mb-6 text-lg leading-relaxed text-ink-600">
        Your account can make changes that affect other people, so it needs a second step at sign-in. Set it up once with an authenticator
        app.
      </p>
      <TotpSetup />
    </>
  );
}

export default function MfaPage() {
  return (
    <AuthCard title="Two-step verification">
      <Suspense fallback={<LoadingIndicator label="Loading" />}>
        <MfaStep />
      </Suspense>
    </AuthCard>
  );
}
