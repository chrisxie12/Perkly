"use client";

import { usePathname } from "next/navigation";
import type { NavArea } from "@/lib/navigation/config";
import { cn } from "@/lib/utils";

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
 * Students see the top bar (photo, Notifications, Chat) and the bottom tabs only on the main
 * pages, such as /student, /student/map or /student/messages. Pages opened from those (a chat,
 * a deal, a shop, a ticket) have their own back button, so both bars step aside like in Snapchat.
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
  const tabs = topBar;
  return (
    <div
      className="flex min-h-dvh flex-col bg-paper"
      // Where sticky page headers stop: under the top bar, or just under the phone's status bar.
      style={
        {
          "--frame-top": topBar ? "calc(env(safe-area-inset-top) + 4.5rem)" : "calc(env(safe-area-inset-top) + 0.75rem)",
          // Where sticky bottom bars (a chat's message box, a deal's button) sit on phones: above the tabs, or near the edge.
          "--frame-bottom": tabs ? "7rem" : "calc(env(safe-area-inset-bottom) + 0.75rem)",
        } as React.CSSProperties
      }
    >
      {topBar ? header : <div className="pt-safe sticky top-0 z-30 bg-paper/85 backdrop-blur-xl" aria-hidden />}
      <div className="flex flex-1">
        {side}
        <main
          className={cn(
            "mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 pt-6 sm:px-5 md:pt-12 md:pb-12",
            tabs ? "pb-28" : "pb-[calc(env(safe-area-inset-bottom)+1.5rem)]",
          )}
        >
          {children}
        </main>
      </div>
      {tabs && bottom}
    </div>
  );
}
