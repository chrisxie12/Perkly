import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, MapPin, PenLine, QrCode, Store, Users } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { getAgreementState } from "@/features/agreements/queries";
import { getActiveMembership, getBranches, getMerchant } from "@/features/merchants/queries";
import { MERCHANT_STATUS_LABEL } from "@/features/merchants/schemas";
import { canManage } from "../merchant-nav";

export const metadata: Metadata = { title: "Business", robots: { index: false } };

export default async function BusinessHubPage() {
  const membership = await getActiveMembership();
  if (!membership || !canManage(membership)) redirect("/merchant");
  const [merchant, branches, agreement] = await Promise.all([
    getMerchant(membership.merchantId),
    getBranches(membership.merchantId),
    getAgreementState(membership.merchantId),
  ]);
  if (!merchant) redirect("/merchant");
  const live = merchant.status === "approved";
  const active = branches.filter((b) => b.is_active).length;
  const links = [
    {
      href: "/merchant/profile",
      icon: Store,
      label: "Shop page",
      text: "Photos, description, contacts, ways to pay and map links",
    },
    { href: "/merchant/branches", icon: MapPin, label: "Branches", text: `${active} active branch${active === 1 ? "" : "es"}` },
    ...(live ? [{ href: "/merchant/codes", icon: QrCode, label: "QR codes", text: "Print each branch's poster" }] : []),
    { href: "/merchant/team", icon: Users, label: "Team", text: "Managers and cashiers" },
    {
      href: "/merchant/agreement",
      icon: PenLine,
      label: "Agreement",
      text: agreement.signature ? `Version ${agreement.signature.version} signed` : "Not signed yet",
    },
  ];
  return (
    <AreaShell area="merchant">
      <PageTitle
        title={merchant.display_name}
        description={`Status: ${MERCHANT_STATUS_LABEL[merchant.status]}. Everything about how your business appears on Perqly.`}
      />
      <ul className="grid gap-4 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-soft ring-1 ring-ink-200/70 hover:ring-blue-300"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <l.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-900">{l.label}</span>
                <span className="text-sm text-ink-600">{l.text}</span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-blue-500" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </AreaShell>
  );
}
