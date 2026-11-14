import * as React from "react";
import { redirect } from "next/navigation";
import { getUserContext } from "@/lib/auth/session";
import { AREA_HOME, AREA_LABEL, loginPath, type Area } from "@/lib/auth/paths";
import { decideAccess } from "@/lib/auth/roles";
import { AccountSuspended, NoAccess } from "./area-states";

/**
 * Server-side guard for an area layout. Render it inside <Suspense>: it reads
 * the session, so it can't be part of the prerendered shell. RLS and database
 * functions remain the real security boundary.
 */
export async function AreaGuard({ area, children }: { area: Area; children: React.ReactNode }) {
  const ctx = await getUserContext();
  if (!ctx) redirect(loginPath(AREA_HOME[area]));

  const decision = decideAccess(area, ctx);
  switch (decision.kind) {
    case "allow":
      return <>{children}</>;
    case "mfa":
      redirect(`/login/mfa?next=${encodeURIComponent(AREA_HOME[area])}`);
    case "suspended":
      return <AccountSuspended />;
    case "forbidden":
      return <NoAccess areaLabel={AREA_LABEL[area]} />;
  }
}
