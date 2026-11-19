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
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      {header}
      <div className="flex flex-1">
        {side}
        <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 pt-6 pb-28 sm:px-5 md:pt-12 md:pb-12">{children}</main>
      </div>
      {bottom}
    </div>
  );
}
