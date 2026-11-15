import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { MerchantProfileForm } from "@/features/merchants/components/merchant-forms";
import { BranchLocationForm, ShopDetailsForm, ShopPhotos } from "@/features/merchants/components/shop-editor";
import { getActiveMembership, getCategories, getMerchant, getShopEditor } from "@/features/merchants/queries";
import { shopChecklist } from "@/features/merchants/shop";
import { getPublicEnv, hasSupabaseEnv } from "@/lib/env";
import { canManage } from "../merchant-nav";

export const metadata: Metadata = { title: "Shop page", robots: { index: false } };

export default async function MerchantProfilePage() {
  const membership = await getActiveMembership();
  if (!membership) redirect("/merchant");
  const [merchant, categories, shop] = await Promise.all([
    getMerchant(membership.merchantId),
    getCategories(),
    getShopEditor(membership.merchantId),
  ]);
  if (!merchant) redirect("/merchant");
  const readOnly = !canManage(membership) || merchant.status === "suspended";
  const photoBase = hasSupabaseEnv()
    ? `${getPublicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/merchant-photos`
    : "";
  const check = shopChecklist({
    photos: shop.photos.length,
    description: merchant.description,
    phone: merchant.phone,
    whatsapp: shop.extras.whatsapp,
    branches: shop.branches,
    socials: shop.extras.socials,
    payment_methods: shop.extras.payment_methods,
  });
  const pct = Math.round((check.done / check.total) * 100);

  return (
    <AreaShell area="merchant">
      <PageTitle
        title="Shop page"
        description={
          merchant.status === "approved"
            ? "This is what students see when they open your business. Changes to a live business are logged."
            : "Students see this page once your business is live."
        }
      />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_18rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardTitle>Photos</CardTitle>
            <CardDescription className="mb-4">Up to 10. Students see the cover first, then the rest in a gallery.</CardDescription>
            <ShopPhotos merchantId={merchant.id} photos={shop.photos} photoBase={photoBase} readOnly={readOnly} />
          </Card>
          <Card>
            <CardTitle>Business details</CardTitle>
            <CardDescription className="mb-4">Your name, description and how to reach you.</CardDescription>
            <MerchantProfileForm merchant={merchant} categories={categories} readOnly={readOnly} />
          </Card>
          <Card>
            <CardTitle>Shop details</CardTitle>
            <CardDescription className="mb-4">Price range, WhatsApp, how students can pay, and what you offer.</CardDescription>
            <ShopDetailsForm merchantId={merchant.id} phone={merchant.phone} extras={shop.extras} readOnly={readOnly} />
          </Card>
          <Card>
            <CardTitle>Finding you</CardTitle>
            <CardDescription className="mb-4">
              A landmark and a Google Maps link for each branch. Address and opening hours are set on{" "}
              <Link href="/merchant/branches" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Branches
              </Link>
              .
            </CardDescription>
            {shop.branches.length === 0 ? (
              <p className="text-ink-700">
                Add a branch first on{" "}
                <Link href="/merchant/branches" className="font-semibold text-blue-700">
                  Branches
                </Link>
                .
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {shop.branches.map((b) => (
                  <li key={b.id} className="py-5 first:pt-0 last:pb-0">
                    <p className="mb-3 font-semibold text-ink-900">
                      {b.name}
                      {!b.is_active && <span className="ml-2 text-sm font-medium text-ink-500">(closed)</span>}
                    </p>
                    <BranchLocationForm branch={b} readOnly={readOnly} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <p className="font-display text-lg font-bold text-ink-900">Your page is {pct}% complete</p>
            <div
              className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink-100"
              role="img"
              aria-label={`${check.done} of ${check.total} done`}
            >
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
            </div>
            <ul className="mt-4 space-y-2">
              {check.items.map((i) => (
                <li key={i.key} className="flex items-start gap-2 text-[0.9375rem]">
                  {i.done ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
                  )}
                  <span className={i.done ? "text-ink-600" : "font-medium text-ink-900"}>
                    {i.label}
                    <span className="sr-only">{i.done ? ": done" : ": to do"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </AreaShell>
  );
}
