"use client";

import { startTransition, useOptimistic } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { setFavourite, toggleFavourite } from "@/features/offers/actions";

/** Fills instantly on tap; the save happens in the background and rolls back if it fails. */
export function HeartButton({ merchantId, saved, back, label }: { merchantId: string; saved: boolean; back: string; label: string }) {
  const [shown, setShown] = useOptimistic(saved);
  return (
    <form
      action={toggleFavourite}
      onSubmit={(e) => {
        e.preventDefault();
        const next = !shown;
        startTransition(async () => {
          setShown(next);
          await setFavourite(merchantId, next);
        });
      }}
    >
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="save" value={shown ? "false" : "true"} />
      <input type="hidden" name="back" value={back} />
      <button
        type="submit"
        aria-pressed={shown}
        aria-label={shown ? `Remove ${label} from saved` : `Save ${label}`}
        className={cn(
          "grid size-11 place-items-center rounded-full transition-transform hover:bg-ink-100 active:scale-90",
          shown ? "text-red-600" : "text-ink-600",
        )}
      >
        <Heart className={cn("size-5", shown && "fill-current")} aria-hidden />
      </button>
    </form>
  );
}
