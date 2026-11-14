"use client";

import * as React from "react";
import { RefreshCw, X } from "lucide-react";
import { useSerwist } from "@serwist/turbopack/react";
import { Button } from "@/components/ui/button";

/**
 * When a new version of Perkly is deployed, the new service worker waits.
 * We tell the user and let them choose when to refresh, so nothing they're
 * doing is interrupted.
 */
export function UpdatePrompt() {
  const { serwist } = useSerwist();
  const [waiting, setWaiting] = React.useState(false);
  // Only reload when the user asked for the update. On a first visit the
  // service worker also takes control, and that must not reload the page.
  const updateRequested = React.useRef(false);

  React.useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => setWaiting(true);
    const onControlling = () => {
      if (updateRequested.current) window.location.reload();
    };
    serwist.addEventListener("waiting", onWaiting);
    serwist.addEventListener("controlling", onControlling);
    return () => {
      serwist.removeEventListener("waiting", onWaiting);
      serwist.removeEventListener("controlling", onControlling);
    };
  }, [serwist]);

  if (!waiting) return null;

  return (
    <div role="status" className="pb-safe fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96">
      <div className="flex items-center gap-3 rounded-xl bg-ink-900 p-4 text-white shadow-lift">
        <p className="flex-1 text-sm leading-snug">
          <span className="font-semibold">A new version of Perkly is ready.</span> Refresh to update.
        </p>
        <Button
          size="sm"
          variant="inverse"
          onClick={() => {
            updateRequested.current = true;
            serwist?.messageSkipWaiting();
          }}
        >
          <RefreshCw aria-hidden /> Refresh
        </Button>
        <button
          type="button"
          onClick={() => setWaiting(false)}
          className="grid size-9 place-items-center rounded-full text-ink-300 hover:bg-white/10 hover:text-white"
          aria-label="Dismiss update message"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
