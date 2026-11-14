import Link from "next/link";
import { Bell, ChevronDown } from "lucide-react";
import { getUserContext } from "@/lib/auth/session";
import { AREA_HOME, AREA_LABEL } from "@/lib/auth/paths";
import { areasFor } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
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
      <Link
        href="/account/notifications"
        className="relative grid size-10 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span
            className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-orange-500 px-1 text-[0.6875rem] leading-4 font-bold text-white"
            aria-hidden
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 [&::-webkit-details-marker]:hidden">
          {ctx.firstName ?? "Account"} <ChevronDown className="size-4" aria-hidden />
          <span className="sr-only">: menu</span>
        </summary>
        <nav aria-label="Account menu" className="absolute right-0 z-20 mt-2 w-56 rounded-xl bg-white p-2 shadow-soft ring-1 ring-ink-200">
          {areas.length > 1 && (
            <>
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
              <hr className="my-2 border-ink-200" />
            </>
          )}
          <Link href="/account" className="block rounded-lg px-3 py-2 text-[0.9375rem] font-medium text-ink-900 hover:bg-ink-100">
            Your account
          </Link>
          <Link
            href="/account/notifications"
            className="block rounded-lg px-3 py-2 text-[0.9375rem] font-medium text-ink-900 hover:bg-ink-100"
          >
            Notifications
          </Link>
        </nav>
      </details>
      <SignOutButton />
    </div>
  );
}
