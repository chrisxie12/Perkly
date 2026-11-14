import * as React from "react";
import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { AccountBar } from "@/components/auth/account-bar";

export function AreaShell({ area, nav, children }: { area: string; nav: { href: string; label: string }[]; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="pt-safe border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-5">
          <Link href="/" aria-label="Perqly home" className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-ink-100 px-3 py-1 text-sm font-semibold text-ink-700 sm:inline">{area}</span>
            <React.Suspense fallback={null}>
              <AccountBar />
            </React.Suspense>
          </div>
        </div>
        <nav aria-label={`${area} sections`} className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-[0.9375rem] font-medium whitespace-nowrap text-ink-700 hover:bg-ink-100 hover:text-ink-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="pb-safe mx-auto w-full max-w-5xl flex-1 px-5 py-8 md:py-12">{children}</main>
    </div>
  );
}

export function PageTitle({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-8 max-w-2xl">
      <h1 className="font-display text-display-md font-extrabold">{title}</h1>
      {description && <div className="mt-3 text-lg leading-relaxed text-ink-600">{description}</div>}
    </div>
  );
}
