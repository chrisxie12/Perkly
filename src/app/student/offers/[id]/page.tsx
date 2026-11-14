import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { Card, CardTitle } from "@/components/ui/card";
import { FavouriteButton } from "@/features/offers/components/marketplace";
import { getOffer } from "@/features/offers/queries";
import { discountLabel, limitLabel, money } from "@/features/offers/schemas";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { formatDate } from "@/features/students/components/status-card";

export const metadata: Metadata = { title: "Offer", robots: { index: false } };

export default async function OfferPage({ params }: PageProps<"/student/offers/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [offer, status] = await Promise.all([getOffer(id), getMyStudentStatus()]);
  if (!offer) notFound();
  const verified = verificationView(status) === "verified";

  return (
    <AreaShell area="student">
      <Link href="/student/explore" className="mb-6 inline-flex items-center gap-2 font-semibold text-blue-600">
        <ArrowLeft className="size-4" aria-hidden /> All offers
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        <div className="space-y-6">
          <div>
            <p className="font-semibold text-blue-700">{discountLabel(offer.discount_type, offer.discount_value)}</p>
            <h1 className="mt-1 font-display text-display-md font-extrabold">{offer.title}</h1>
            <p className="mt-2 text-lg">
              at{" "}
              <Link href={`/student/merchants/${offer.merchant.slug}`} className="font-semibold text-ink-900 underline underline-offset-2">
                {offer.merchant.display_name}
              </Link>
            </p>
          </div>
          <Card>
            <dl className="divide-y divide-ink-200">
              <div className="flex justify-between py-3">
                <dt className="text-ink-700">Regular price</dt>
                <dd className="font-medium text-ink-900">{money(offer.regular_price)}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-ink-700">Student discount</dt>
                <dd className="font-medium text-success">−{money(offer.discount_amount)}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="font-semibold text-ink-900">You pay the business</dt>
                <dd className="font-display text-2xl font-extrabold text-ink-900">{money(offer.final_price)}</dd>
              </div>
            </dl>
          </Card>
          <Card>
            <CardTitle>Conditions</CardTitle>
            <p className="mt-2 leading-relaxed text-ink-700">{offer.conditions}</p>
            <p className="mt-3 text-sm text-ink-600">
              {limitLabel(offer.per_student_limit, offer.per_student_period)} per student.
              {offer.ends_at ? ` Ends ${formatDate(offer.ends_at)}.` : ""}
            </p>
            {(offer.description || offer.item_description) && (
              <p className="mt-3 text-ink-700">{offer.description ?? offer.item_description}</p>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardTitle>How to redeem</CardTitle>
            {verified ? (
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-700">
                <li>Go to one of the branches below.</li>
                <li>Scan the Perqly code at the counter with your phone.</li>
                <li>Pick this offer. The cashier confirms, then you confirm.</li>
                <li>Pay the business {money(offer.final_price)} directly.</li>
              </ol>
            ) : (
              <p className="mt-3 text-ink-700">
                You can redeem once your school verifies you.{" "}
                <Link href="/student/verify" className="font-semibold text-blue-600 underline underline-offset-2">
                  Check your verification
                </Link>
              </p>
            )}
            <div className="mt-5">
              <FavouriteButton merchantId={offer.merchant.id} saved={offer.is_favourite} back={`/student/offers/${offer.offer_id}`} />
            </div>
          </Card>
          <Card>
            <CardTitle>Where</CardTitle>
            <ul className="mt-3 space-y-4">
              {offer.branches.map((b) => (
                <li key={b.id} className="flex gap-3">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-blue-500" aria-hidden />
                  <span>
                    <span className="block font-semibold text-ink-900">{b.name}</span>
                    <span className="block text-sm text-ink-600">{[b.address, b.digital_address].filter(Boolean).join(" · ")}</span>
                    {b.opening_hours && <span className="block text-sm text-ink-600">{b.opening_hours}</span>}
                    {b.latitude !== null && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`}
                        className="text-sm font-semibold text-blue-600 underline underline-offset-2"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Maps
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </AreaShell>
  );
}
