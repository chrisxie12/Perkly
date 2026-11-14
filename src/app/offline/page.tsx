import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };

/**
 * Served by the service worker when a page can't load without a
 * connection. Shows no account or transaction information.
 */
export default function OfflinePage() {
  return (
    <main className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
      <Logo />
      <div className="mt-12 grid size-20 place-items-center rounded-3xl bg-blue-50 text-blue-600">
        <WifiOff className="size-10" aria-hidden />
      </div>
      <h1 className="mt-8 font-display text-display-md font-extrabold">You&apos;re offline.</h1>
      <p className="mt-4 max-w-sm text-lg leading-relaxed text-ink-600">
        Perkly needs a connection to load this page. Check your data or Wi-Fi, then try again.
      </p>
      <RetryButton />
      <p className="mt-6 max-w-sm text-sm text-ink-600">
        Redeeming a deal always needs a connection, so passes can&apos;t be faked offline.
      </p>
    </main>
  );
}
