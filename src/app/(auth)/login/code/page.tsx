import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { AuthCard } from "@/features/auth/components/auth-card";
import { CodeForm } from "@/features/auth/components/code-form";

export const metadata: Metadata = { title: "Enter your code", robots: { index: false } };

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "your email";
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
}

async function SentTo() {
  const raw = (await cookies()).get("perqly_pending_signin")?.value;
  let email: string | null = null;
  try {
    email = raw ? ((JSON.parse(raw) as { email?: string }).email ?? null) : null;
  } catch {
    email = null;
  }
  return <>{email ? <strong className="font-semibold text-ink-900">{maskEmail(email)}</strong> : "your email"}</>;
}

export default function CodePage() {
  return (
    <AuthCard
      title="Check your email"
      description={
        <p>
          If there&apos;s a Perqly account for{" "}
          <Suspense fallback="your email">
            <SentTo />
          </Suspense>
          , we&apos;ve sent it a 6-digit code. It expires in 10 minutes.
        </p>
      }
      footer={
        <>
          Wrong email?{" "}
          <Link href="/login" className="font-semibold text-blue-600 underline underline-offset-2">
            Start again
          </Link>
        </>
      }
    >
      <Suspense>
        <CodeForm />
      </Suspense>
    </AuthCard>
  );
}
