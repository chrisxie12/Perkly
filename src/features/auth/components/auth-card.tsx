import * as React from "react";
import Link from "next/link";
import { Logo } from "@/components/shared/logo";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="pt-safe pb-safe flex min-h-dvh flex-col bg-paper">
      <header className="mx-auto flex h-16 w-full max-w-md items-center px-5">
        <Link href="/" aria-label="Perqly home" className="rounded-lg">
          <Logo />
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-6 pb-12 sm:pt-12">
        <h1 className="font-display text-display-md font-extrabold">{title}</h1>
        {description && <div className="mt-3 text-lg leading-relaxed text-ink-600">{description}</div>}
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-8 text-[0.9375rem] text-ink-600">{footer}</div>}
      </div>
    </main>
  );
}

export function NotConfiguredNotice() {
  return (
    <p role="status" className="mb-6 rounded-lg bg-orange-50 px-4 py-3 text-sm font-medium text-ink-900 ring-1 ring-orange-200">
      Sign-in isn&apos;t switched on in this environment yet. You can look around, but codes won&apos;t be sent.
    </p>
  );
}
