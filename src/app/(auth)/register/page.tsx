import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { hasSupabaseEnv } from "@/lib/env";
import { AuthCard, NotConfiguredNotice } from "@/features/auth/components/auth-card";
import { SignUpForm } from "@/features/auth/components/sign-up-form";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your Perqly account"
      description="Free for students. It takes a minute, and we'll email you a code to confirm it's you."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-blue-600 underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      {!hasSupabaseEnv() && <NotConfiguredNotice />}
      <Suspense>
        <SignUpForm />
      </Suspense>
    </AuthCard>
  );
}
