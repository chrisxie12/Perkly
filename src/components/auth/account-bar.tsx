import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getUserContext } from "@/lib/auth/session";
import { AREA_HOME, AREA_LABEL } from "@/lib/auth/paths";
import { areasFor } from "@/lib/auth/roles";
import { SignOutButton } from "./sign-out-button";

/**
 * Signed-in name, a switcher for people with more than one area (student,
 * reviewer, staff, merchant), and sign-out. Render inside a Suspense boundary.
 */
export async function AccountBar() {
  const ctx = await getUserContext();
  if (!ctx) return null;
  const areas = areasFor(ctx);
  return (
    <div className="flex items-center gap-2">
      {areas.length > 1 ? (
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 [&::-webkit-details-marker]:hidden">
            {ctx.firstName ?? "Account"} <ChevronDown className="size-4" aria-hidden />
            <span className="sr-only">: switch area</span>
          </summary>
          <nav aria-label="Switch area" className="absolute right-0 z-20 mt-2 w-56 rounded-xl bg-white p-2 shadow-soft ring-1 ring-ink-200">
            <p className="px-3 pt-1 pb-2 text-xs font-semibold text-ink-600">Go to</p>
            {areas.map((area) => (
              <Link
                key={area}
                href={AREA_HOME[area]}
                className="block rounded-lg px-3 py-2 text-[0.9375rem] font-medium text-ink-900 hover:bg-ink-100"
              >
                {AREA_LABEL[area]}
              </Link>
            ))}
          </nav>
        </details>
      ) : (
        <span className="hidden text-sm font-medium text-ink-700 sm:inline">{ctx.firstName ?? "Signed in"}</span>
      )}
      <SignOutButton />
    </div>
  );
}
