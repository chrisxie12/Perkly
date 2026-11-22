"use client";

import { usePathname } from "next/navigation";
import type { NavArea } from "@/lib/navigation/config";

/** Routes that take the whole screen: the camera scanner and the live pass. */
const IMMERSIVE: Record<NavArea, string[]> = {
  student: ["/student/scan", "/student/redeem/"],
  merchant: [],
  institution: [],
  admin: [],
  organise: [],
  account: [],
};

export function isImmersive(area: NavArea, pathname: string) {
  return IMMERSIVE[area].some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
}

/**
 * Students see the top bar (photo, Notifications, Chat) only on the main pages, such as
 * /student, /student/map or /student/messages. Pages opened from those (a chat, a deal,
 * a shop, a ticket) have their own back button, so the bar steps aside like in Snapchat.
 */
export function showsTopBar(area: NavArea, pathname: string) {
  if (area !== "student") return true;
  return pathname.split("/").filter(Boolean).length <= 2;
}

export function FrameChrome({
  area,
  header,
  side,
  bottom,
  children,
}: {
  area: NavArea;
  header: React.ReactNode;
  side: React.ReactNode;
  bottom: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (isImmersive(area, pathname)) return <div className="flex min-h-dvh flex-col">{children}</div>;
  const topBar = showsTopBar(area, pathname);
  return (
    <div
      className="flex min-h-dvh flex-col bg-paper"
      // Where sticky page headers should stop: under the top bar, or just under the phone's status bar.
      style={
        {
          "--frame-top": topBar ? "calc(env(safe-area-inset-top) + 4.5rem)" : "calc(env(safe-area-inset-top) + 0.75rem)",
        } as React.CSSProperties
      }
    >
      {topBar ? header : <div className="pt-safe sticky top-0 z-30 bg-paper/85 backdrop-blur-xl" aria-hidden />}
      <div className="flex flex-1">
        {side}
        <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 pt-6 pb-28 sm:px-5 md:pt-12 md:pb-12">{children}</main>
      </div>
      {bottom}
    </div>
  );
}
