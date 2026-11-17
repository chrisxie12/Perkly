import { getAppEnv } from "@/lib/env";

const LABELS = {
  staging: "Staging: test data only",
  development: "Development",
} as const;

/**
 * A small label on every page outside production, so a preview or a laptop
 * can never be mistaken for the real Perqly. It doesn't take clicks, so the
 * header underneath keeps working. Production renders nothing.
 */
export function EnvironmentBanner() {
  const env = getAppEnv();
  if (env === "production") return null;
  return (
    <div
      role="note"
      aria-label={`${LABELS[env]}. This is not the live Perqly.`}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center pt-[env(safe-area-inset-top)]"
    >
      <span className="rounded-b-md bg-amber-400 px-2.5 py-0.5 text-[11px] leading-5 font-semibold text-black shadow-sm">
        {LABELS[env]}
      </span>
    </div>
  );
}
