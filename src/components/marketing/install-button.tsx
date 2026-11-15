"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Download, Smartphone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Outcome = "accepted" | "dismissed" | null;

/**
 * "Install Perqly" when the browser offers a one-tap install (Android Chrome,
 * desktop Chrome and Edge); otherwise "Get the app", which opens the
 * step-by-step guide (iPhone, other browsers). Renders the guide link on the
 * server, so the page works before any JavaScript loads.
 */
// One store for every Install button on the page: the browser's install offer, and whether the app is installed.
type InstallState = { prompt: InstallPrompt | null; installed: boolean };
let state: InstallState = { prompt: null, installed: false };
const listeners = new Set<() => void>();
const set = (next: Partial<InstallState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
let started = false;
function start() {
  if (started) return;
  started = true;
  // Captured by the inline script in the marketing layout if it fired before this loaded.
  const early = (window as Window & { __perqlyInstall?: InstallPrompt }).__perqlyInstall;
  state = { prompt: early ?? null, installed: window.matchMedia("(display-mode: standalone)").matches };
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the browser's own mini-bar away; the button asks instead
    set({ prompt: e as InstallPrompt });
  });
  window.addEventListener("appinstalled", () => set({ prompt: null, installed: true }));
}
const subscribe = (l: () => void) => {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
};
const SERVER: InstallState = { prompt: null, installed: false };

export function InstallButton({
  variant = "primary",
  className,
  hideFallback = false,
}: {
  variant?: "primary" | "accent";
  className?: string;
  /** On the install guide itself, show nothing when one-tap install isn't available. */
  hideFallback?: boolean;
}) {
  const { prompt, installed } = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER,
  );
  const [outcome, setOutcome] = useState<Outcome>(null);

  const classes = cn(buttonVariants({ variant, size: "lg" }), "gap-2", className);

  if (installed || outcome === "accepted")
    return (
      <p role="status" className="inline-flex h-14 items-center gap-2 font-semibold text-emerald-800">
        <Smartphone className="size-5" aria-hidden /> Perqly is on your home screen.
      </p>
    );

  if (!prompt && hideFallback) return null;
  if (!prompt)
    return (
      <Link href="/install" className={classes}>
        <Download className="size-5" aria-hidden /> Get the app
      </Link>
    );

  return (
    <button
      type="button"
      className={classes}
      onClick={async () => {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        setOutcome(choice.outcome);
        // The browser only lets the prompt be used once; after a "not now", fall back to the guide.
        set({ prompt: null });
      }}
    >
      <Download className="size-5" aria-hidden /> Install Perqly
    </button>
  );
}
