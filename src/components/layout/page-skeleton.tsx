/**
 * Shown the instant a tab or link is tapped, while the page's data arrives.
 * The frame (top bar and tabs) stays put; only this content area changes.
 */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="motion-safe:animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-ink-200/70" />
      <div className="mt-3 h-4 w-72 max-w-full rounded bg-ink-200/50" />
      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-ink-200/70">
            <div className="size-12 shrink-0 rounded-xl bg-ink-200/70" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/5 rounded bg-ink-200/70" />
              <div className="h-3 w-2/5 rounded bg-ink-200/50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
