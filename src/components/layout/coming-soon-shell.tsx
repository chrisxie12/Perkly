import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

/**
 * Honest placeholder for an area that isn't built yet. It shows no data
 * and no controls that pretend to work.
 */
export function ComingSoonShell({
  area,
  title,
  description,
  points,
  action,
}: {
  area: string;
  title: string;
  description: string;
  points: string[];
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="pt-safe border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <Link href="/" aria-label="Perqly home">
            <Logo />
          </Link>
          <span className="rounded-full bg-ink-100 px-3 py-1 text-sm font-semibold text-ink-700">{area}</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-16">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-800">
          <span className="size-2 rounded-full bg-orange-500" aria-hidden /> Coming soon
        </p>
        <h1 className="mt-5 max-w-3xl font-display text-display-lg font-extrabold">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-600">{description}</p>
        <ul className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-2">
          {points.map((point) => (
            <li key={point} className="rounded-xl bg-white p-5 text-ink-700 shadow-soft ring-1 ring-ink-200/70">
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          {action}
          <Button asChild variant="ghost">
            <Link href="/">
              <ArrowLeft aria-hidden /> Back to home
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
