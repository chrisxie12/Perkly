"use client";

import { Share2 } from "lucide-react";

/** Shares a line about what the student saved. No ID, school email or photo goes with it. */
export function ShareSavings({ text }: { text: string }) {
  return (
    <button
      type="button"
      aria-label="Share your savings"
      className="grid size-11 place-items-center rounded-full hover:bg-ink-100"
      onClick={async () => {
        const url = window.location.origin;
        if (navigator.share) {
          try {
            await navigator.share({ text, url });
            return;
          } catch {
            return;
          }
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
      }}
    >
      <Share2 className="size-5" aria-hidden />
    </button>
  );
}
