import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getUserContext } from "@/lib/auth/session";
import { AREA_HOME, AREA_LABEL } from "@/lib/auth/paths";
import { areasFor } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { LiveBell } from "./live-bell";
import { SignOutButton } from "./sign-out-button";

/**
 * Signed-in name with a menu (areas, account, notifications), an unread
 * notifications badge, and sign-out. Render inside a Suspense boundary.
 */
export async function AccountBar() {
  const ctx = await getUserContext();
  if (!ctx) return null;
  const areas = areasFor(ctx);
  const supabase = await createClient();
  const { data } = await supabase.rpc("unread_notification_count");
  const unread = typeof data === "number" ? data : 0;
  return (
    <div className="flex items-center gap-1">
      <LiveBell userId={ctx.userId} initialUnread={unread} />
      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full p-1 text-sm font-medium text-ink-700 hover:bg-ink-100 sm:px-3 sm:py-2 [&::-webkit-details-marker]:hidden">
          <span className="grid size-8 place-items-center rounded-full bg-blue-50 font-semibold text-blue-700 sm:hidden" aria-hidden>
            {(ctx.firstName ?? ctx.fullName ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-32 truncate sm:inline">{ctx.firstName ?? "Account"}</span>
          <ChevronDown className="hidden size-4 sm:block" aria-hidden />
          <span className="sr-only">Account menu</span>
        </summary>
        <nav
          aria-label="Account menu"
          className="absolute right-0 z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-2 shadow-soft ring-1 ring-ink-200"
        >
          <p className="truncate px-3 pt-1 pb-2 text-sm font-semibold text-ink-900">{ctx.fullName ?? ctx.firstName ?? "Your account"}</p>
          {areas.length > 1 && (
            <>
              <p className="px-3 pt-1 pb-1 text-xs font-semibold text-ink-600">Switch to</p>
              {areas.map((area) => (
                <Link
                  key={area}
                  href={AREA_HOME[area]}
                  className="block rounded-lg px-3 py-2.5 text-[0.9375rem] font-medium text-ink-900 hover:bg-ink-100"
                >
                  {AREA_LABEL[area]}
                </Link>
              ))}
              <hr className="my-2 border-ink-200" />
            </>
          )}
          <Link href="/account" className="block rounded-lg px-3 py-2.5 text-[0.9375rem] font-medium text-ink-900 hover:bg-ink-100">
            Your account
          </Link>
          <Link
            href="/account/notifications"
            className="block rounded-lg px-3 py-2.5 text-[0.9375rem] font-medium text-ink-900 hover:bg-ink-100"
          >
            Notifications
          </Link>
          <hr className="my-2 border-ink-200" />
          <div className="px-1">
            <SignOutButton />
          </div>
        </nav>
      </details>
    </div>
  );
}
