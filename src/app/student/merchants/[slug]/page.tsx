import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/states";
import { FavouriteButton, OfferCard } from "@/features/offers/components/marketplace";
import { getMerchantPage, listOffers } from "@/features/offers/queries";
import { studentNav } from "../../student-nav";

export const metadata: Metadata = { title: "Business", robots: { index: false } };

export default async function MerchantPublicPage({ params }: PageProps<"/student/merchants/[slug]">) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) notFound();
  const merchant = await getMerchantPage(slug);
  if (!merchant) notFound();
  const offers = await listOffers({ merchantId: merchant.id });

  return (
    <AreaShell area="Student" nav={studentNav}>
      <Link href="/student" className="mb-6 inline-flex items-center gap-2 font-semibold text-blue-600">
        <ArrowLeft className="size-4" aria-hidden /> All offers
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageTitle title={merchant.display_name} description={merchant.category} />
        <FavouriteButton merchantId={merchant.id} saved={merchant.is_favourite} back={`/student/merchants/${merchant.slug}`} />
      </div>
      {merchant.description && <p className="mb-8 max-w-2xl text-lg leading-relaxed text-ink-700">{merchant.description}</p>}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <section aria-labelledby="offers-heading">
          <h2 id="offers-heading" className="mb-4 font-display text-xl font-bold">
            Student offers
          </h2>
          {offers.length === 0 ? (
            <EmptyState title="No offers right now" description="Save this business to find it again when it adds one." />
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2">
              {offers.map((offer) => (
                <li key={offer.offer_id}>
                  <OfferCard offer={offer} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <Card>
          <CardTitle>Branches</CardTitle>
          <ul className="mt-3 space-y-4">
            {merchant.branches.map((b) => (
              <li key={b.id} className="flex gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-blue-500" aria-hidden />
                <span>
                  <span className="block font-semibold text-ink-900">{b.name}</span>
                  <span className="block text-sm text-ink-600">{[b.address, b.digital_address].filter(Boolean).join(" · ")}</span>
                  {b.opening_hours && <span className="block text-sm text-ink-600">{b.opening_hours}</span>}
                </span>
              </li>
            ))}
          </ul>
          {merchant.phone && (
            <a
              href={`tel:${merchant.phone.replace(/\s/g, "")}`}
              className="mt-5 inline-flex items-center gap-2 font-semibold text-blue-600"
            >
              <Phone className="size-4" aria-hidden /> {merchant.phone}
            </a>
          )}
        </Card>
      </div>
    </AreaShell>
  );
}
