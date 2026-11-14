import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { getPublicEnv } from "@/lib/env";
import { getActiveMembership, getMerchant } from "@/features/merchants/queries";
import { PrintPosterButton, ReissueForm } from "@/features/redemptions/components/code-tools";
import { getBranchCodes } from "@/features/redemptions/queries";
import { canManage, merchantNavFor } from "../merchant-nav";

export const metadata: Metadata = { title: "QR codes", robots: { index: false } };

const when = new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

export default async function CodesPage() {
  const membership = await getActiveMembership();
  if (!membership || !canManage(membership) || membership.status !== "approved") redirect("/merchant");
  const [merchant, codes] = await Promise.all([getMerchant(membership.merchantId), getBranchCodes(membership.merchantId)]);
  if (!merchant) redirect("/merchant");
  const base = getPublicEnv().NEXT_PUBLIC_SITE_URL ?? "https://perqly-eta.vercel.app";
  const withSvg = await Promise.all(
    (codes ?? []).map(async (c) => ({
      ...c,
      svg: c.token
        ? await QRCode.toString(new URL(`/r/${c.token}`, base).toString(), { type: "svg", errorCorrectionLevel: "M", margin: 4 })
        : null,
    })),
  );

  return (
    <AreaShell area="Merchant" nav={merchantNavFor(membership)}>
      <PageTitle
        title="QR codes"
        description="Each branch has one code. Print the poster and put it where students pay. The code only identifies the branch; your cashier still confirms every discount."
      />
      {codes === null ? (
        <p className="text-ink-700">Owners need two-step verification to see the codes.</p>
      ) : withSvg.length === 0 ? (
        <EmptyState icon={<QrCode />} title="No active branches" description="Add an active branch to get a code." />
      ) : (
        <ul className="space-y-8">
          {withSvg.map((c) => (
            <li key={c.branch_id} className="grid gap-6 rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink-200/70 md:grid-cols-[auto_1fr]">
              {c.svg && c.qr_code_id ? (
                <>
                  <div id={`poster-${c.branch_id}`} className="perqly-poster mx-auto w-64 text-center">
                    <p className="font-display text-xl font-extrabold text-ink-900">{merchant.display_name}</p>
                    <p className="font-semibold text-ink-700">{c.branch_name}</p>
                    <p className="mt-3 font-semibold text-blue-700">Student? Scan with Perqly</p>
                    <div className="mx-auto mt-2 w-56" dangerouslySetInnerHTML={{ __html: c.svg }} />
                    <p className="font-mono text-2xl font-bold tracking-widest text-ink-900">{c.short_code}</p>
                    <p className="mt-2 text-xs text-ink-600">Perqly never takes payment. Pay the business directly.</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="font-display text-lg font-bold text-ink-900">{c.branch_name}</p>
                      <p className="text-sm text-ink-600">
                        Version {c.version}, issued {c.issued_at ? when.format(new Date(c.issued_at)) : ""}.{" "}
                        {c.last_scanned_at ? `Last scanned ${when.format(new Date(c.last_scanned_at))}.` : "Not scanned yet."}
                      </p>
                    </div>
                    <PrintPosterButton qrCodeId={c.qr_code_id} posterId={`poster-${c.branch_id}`} />
                    <details>
                      <summary className="cursor-pointer font-semibold text-blue-600">Code photographed, damaged or moved?</summary>
                      <div className="mt-3">
                        <ReissueForm branchId={c.branch_id} />
                      </div>
                    </details>
                  </div>
                </>
              ) : (
                <p className="text-ink-700">{c.branch_name}: no active code. Issue one below.</p>
              )}
              {!c.svg && <ReissueForm branchId={c.branch_id} />}
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
