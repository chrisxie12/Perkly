import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoadingIndicator } from "@/components/shared/states";
import { getUserContext } from "@/lib/auth/session";
import { loginPath } from "@/lib/auth/paths";
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
