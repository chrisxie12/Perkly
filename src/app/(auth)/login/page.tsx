import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { hasSupabaseEnv } from "@/lib/env";
import { AuthCard, NotConfiguredNotice } from "@/features/auth/components/auth-card";
import { SignInForm } from "@/features/auth/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <AuthCard
      title="Sign in to Perqly"
      description="We'll email you a 6-digit code. No password needed."
      footer={
        <>
          New to Perqly?{" "}
          <Link href="/register" className="font-semibold text-blue-600 underline underline-offset-2">
            Create an account
          </Link>
        </>
      }
    >
      {!hasSupabaseEnv() && <NotConfiguredNotice />}
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
