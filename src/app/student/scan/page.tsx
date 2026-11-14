import type { Metadata } from "next";
import Link from "next/link";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { getPublicEnv } from "@/lib/env";
import { enterShortCode } from "@/features/redemptions/actions";
import { Scanner } from "@/features/redemptions/components/scanner";
import { getMyLiveSession } from "@/features/redemptions/queries";
import { redemptionErrorMessage } from "@/features/redemptions/schemas";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { studentNav } from "../student-nav";

export const metadata: Metadata = { title: "Scan to redeem", robots: { index: false } };

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export default async function ScanPage({ searchParams }: PageProps<"/student/scan">) {
  const params = await searchParams;
  const [status, live] = await Promise.all([getMyStudentStatus(), getMyLiveSession()]);
  const verified = verificationView(status) === "verified";
  const error = str(params.error);
  const message =
    error === "code_format"
      ? "Codes are 8 letters and numbers, printed under the QR."
      : error === "unavailable"
        ? "Redeeming isn't available in this environment yet."
        : error
          ? redemptionErrorMessage(error, { merchant_name: str(params.merchant) })
          : null;
  const site = getPublicEnv().NEXT_PUBLIC_SITE_URL;
  const origins = [site ? new URL(site).origin : null, "https://perqly-eta.vercel.app"].filter((o): o is string => Boolean(o));
  const otherSession = str(params.session);

  return (
    <AreaShell area="Student" nav={studentNav}>
      <PageTitle
        title="Scan to redeem"
        description="Scan the Perqly code at the counter after you've been served. Pay the business directly; Perqly never takes payment."
      />
      {message && (
        <div role="alert" className="mb-6 rounded-xl bg-orange-50 p-4 font-medium text-ink-900 ring-1 ring-orange-200">
          {message}{" "}
          {error === "not_verified" || error === "verification_expired" ? (
            <Link href="/student/verify" className="font-semibold text-blue-600 underline underline-offset-2">
              Check your verification
            </Link>
          ) : error === "session_in_progress" && otherSession ? (
            <Link href={`/student/redeem/${otherSession}`} className="font-semibold text-blue-600 underline underline-offset-2">
              Open it
            </Link>
          ) : null}
        </div>
      )}
      {live && !message && (
        <div className="mb-6 rounded-xl bg-blue-50 p-4 font-medium text-ink-900 ring-1 ring-blue-200">
          You have a redemption in progress.{" "}
          <Link href={`/student/redeem/${live}`} className="font-semibold text-blue-600 underline underline-offset-2">
            Continue it
          </Link>
        </div>
      )}
      {!verified ? (
        <Card>
          <CardTitle>Verify first</CardTitle>
          <p className="mt-2 text-ink-700">{redemptionErrorMessage("not_verified")}</p>
          <Link href="/student/verify" className="mt-4 inline-block font-semibold text-blue-600 underline underline-offset-2">
            Check your verification
          </Link>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
          <Scanner allowedOrigins={origins} />
          <Card>
            <CardTitle>Can&apos;t scan? Enter the code</CardTitle>
            <p className="mt-2 text-ink-700">It&apos;s the 8 letters and numbers printed under the QR.</p>
            <form action={enterShortCode} className="mt-4 space-y-3">
              <div>
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  name="code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={12}
                  placeholder="7K3M9Q2D"
                  className="font-mono tracking-widest uppercase"
                />
              </div>
              <SubmitButton>Open</SubmitButton>
            </form>
          </Card>
        </div>
      )}
    </AreaShell>
  );
}
