import * as React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { Lock } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { CampusChip } from "@/components/auth/campus-chip";
import { AccountBar } from "@/components/auth/account-bar";
import { buttonVariants } from "@/components/ui/button";
import { getUserContext } from "@/lib/auth/session";
import { AREA_TITLE, navFor, routeAccess, type NavArea, type NavContext } from "@/lib/navigation/config";
import { PATH_HEADER } from "@/lib/navigation/path-header";
import { getActiveMembership } from "@/features/merchants/queries";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { BottomNav, SideNav } from "./app-nav";
import { getCampusEnabled } from "@/features/campus/queries";
import { FrameChrome } from "./frame-chrome";

async function navContext(area: NavArea): Promise<NavContext | null> {
  const ctx = await getUserContext();
  if (!ctx) return null;
  if (area === "student") {
    const [status, campus] = await Promise.all([getMyStudentStatus(), getCampusEnabled()]);
    return { ctx, verification: verificationView(status), campus: campus.posts };
  }
  if (area === "merchant") return { ctx, membership: await getActiveMembership() };
  if (area === "admin") return { ctx, campus: (await getCampusEnabled()).posts };
  return { ctx };
}

/**
 * The signed-in app frame: top bar (notifications, account menu, area switcher),
 * a sidebar on tablets and desktops, and bottom tabs on phones. It lives in each
 * area's layout, so it stays on screen while pages change: tapping a tab swaps
 * only the page, like a native app. Full-screen flows (scanner, live pass) hide it.
 */
export async function AreaFrame({ area, children }: { area: NavArea; children: React.ReactNode }) {
  const n = await navContext(area);
  const nav = n ? navFor(area, n) : null;
  return (
    <FrameChrome
      area={area}
      header={
        <header className="pt-safe sticky top-0 z-30 border-b border-ink-200/60 bg-white/75 backdrop-blur-xl backdrop-saturate-150">
          <div className="flex h-16 items-center justify-between gap-2 px-4 md:px-5">
            <div className="flex items-center gap-3">
              <Link href="/" aria-label="Perqly home" className="shrink-0 rounded-lg">
                <Logo />
              </Link>
              <span className="hidden rounded-full bg-ink-100 px-3 py-1 text-sm font-semibold text-ink-700 sm:inline">
                {AREA_TITLE[area]}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-1">
              {area === "student" && (
                <React.Suspense fallback={null}>
                  <CampusChip />
                </React.Suspense>
              )}
              <React.Suspense fallback={null}>
                <AccountBar />
              </React.Suspense>
            </div>
          </div>
        </header>
      }
      side={nav ? <SideNav nav={nav} /> : null}
      bottom={nav ? <BottomNav nav={nav} /> : null}
    >
      {children}
    </FrameChrome>
  );
}

/**
 * Per-page check that this user may open this page (the frame itself is in the
 * layout). Pages wrap their content in it; `immersive` pages draw the whole screen.
 */
export async function AreaShell({
  area,
  children,
}: {
  area: NavArea;
  /** Kept for readability at call sites; the frame hides itself on full-screen routes. */
  immersive?: boolean;
  children: React.ReactNode;
}) {
  const [n, h] = await Promise.all([navContext(area), headers()]);
  const path = h.get(PATH_HEADER) ?? "";
  const nav = n ? navFor(area, n) : null;
  const decision = n && path ? routeAccess(path, n) : { kind: "allow" as const };
  if (decision.kind === "allow") return <>{children}</>;
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
        <Lock className="size-7" aria-hidden />
      </div>
      <h1 className="mt-5 font-display text-2xl font-extrabold">You can&apos;t open this page</h1>
      <p className="mt-2 text-ink-700">{decision.reason}</p>
      <Link href={nav?.tabs[0]?.href ?? "/auth/continue"} className={`${buttonVariants({ variant: "secondary" })} mt-6`}>
        Go to {nav?.tabs[0]?.label ?? "your area"}
      </Link>
    </div>
  );
}

export function PageTitle({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-6 max-w-2xl sm:mb-8">
      <h1 className="font-display text-display-md font-extrabold">{title}</h1>
      {description && <div className="mt-2 text-base leading-relaxed text-ink-600 sm:mt-3 sm:text-lg">{description}</div>}
    </div>
  );
}
