import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getRequestOrigin } from "@/lib/auth/origin";
import { getPublicEnv, isProductionEnv } from "@/lib/env";
import { Scanner } from "@/features/redemptions/components/scanner";
import { getMyLiveSession } from "@/features/redemptions/queries";
import { redemptionErrorMessage } from "@/features/redemptions/schemas";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";

export const metadata: Metadata = { title: "Scan", robots: { index: false } };
// The camera screen is black, so the phone's bars go black with it.
export const viewport: Viewport = { themeColor: "#000000" };

const LEGACY_PRODUCTION_ORIGIN = "https://perqly-eta.vercel.app";

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export default async function ScanPage({ searchParams }: PageProps<"/student/scan">) {
  const params = await searchParams;
  const [status, live] = await Promise.all([getMyStudentStatus(), getMyLiveSession()]);
  const view = verificationView(status);
  const error = str(params.error);
  // With a redemption open, the live pass is the screen to show.
  if (live && !error) redirect(`/student/redeem/${live}`);

  if (view !== "verified") {
    return (
      <AreaShell area="student">
        <PageTitle
          title="Scan to redeem"
          description={redemptionErrorMessage(view === "expired" ? "verification_expired" : "not_verified")}
        />
        <Card>
          <p className="text-ink-700">You can browse deals and save shops now. Scanning unlocks as soon as you&apos;re verified.</p>
          <Link href={view === "needs_profile" ? "/student/profile" : "/student/verify"} className={`${buttonVariants({})} mt-4`}>
            {view === "pending" ? "See your verification" : view === "needs_profile" ? "Choose your school" : "Start verification"}
          </Link>
        </Card>
      </AreaShell>
    );
  }

  const message =
    error === "unavailable"
      ? "Redeeming isn't available in this environment yet."
      : error
        ? redemptionErrorMessage(error, { merchant_name: str(params.merchant) })
        : null;
  const site = getPublicEnv().NEXT_PUBLIC_SITE_URL;
  // Posters printed before perqly.online was set up carry perqly-eta.vercel.app,
  // which still serves production, so production keeps accepting it. Staging doesn't.
  const legacy = isProductionEnv() ? [LEGACY_PRODUCTION_ORIGIN] : [];
  const origins = [...new Set([site ? new URL(site).origin : null, await getRequestOrigin(), ...legacy])].filter((o): o is string =>
    Boolean(o),
  );

  return (
    <AreaShell area="student" immersive>
      <Scanner allowedOrigins={origins} message={message} />
      {error === "session_in_progress" && str(params.session) && (
        <Link
          href={`/student/redeem/${str(params.session)}`}
          className="fixed inset-x-4 bottom-24 z-20 rounded-xl bg-white p-3 text-center font-semibold text-blue-700"
        >
          Open the redemption in progress
        </Link>
      )}
    </AreaShell>
  );
}
