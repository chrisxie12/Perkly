import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Five stars, filled to the nearest half, for showing a score. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-4",
            value >= n - 0.25 ? "fill-orange-500 text-orange-500" : value >= n - 0.75 ? "fill-orange-200 text-orange-500" : "text-ink-300",
          )}
        />
      ))}
    </span>
  );
}
