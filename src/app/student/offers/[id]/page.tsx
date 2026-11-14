import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronLeft, Clock, FileText, Footprints, Lock, MapPin, Repeat, ScanLine } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { getOffer, listDeals } from "@/features/offers/queries";
import { discountLabel, limitLabel, money } from "@/features/offers/schemas";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { formatDate } from "@/features/students/components/status-card";
import { DealRow, HeartButton, MerchantAvatar, toneFor, walkLabel } from "@/features/students/app/bits";

export const metadata: Metadata = { title: "Deal", robots: { index: false } };

export default async function DealPage({ params }: PageProps<"/student/offers/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [offer, status] = await Promise.all([getOffer(id), getMyStudentStatus()]);
  if (!offer) notFound();
  const merchantDeals = await listDeals({ merchantId: offer.merchant.id });
  const here = merchantDeals.find((d) => d.offer_id === offer.offer_id);
  const others = merchantDeals.filter((d) => d.offer_id !== offer.offer_id);
  const view = verificationView(status);
  const verified = view === "verified";
  const tone = toneFor(here?.category_slug);
  const walk = walkLabel(here?.distance_m);
  const back = `/student/offers/${offer.offer_id}`;

  return (
    <AreaShell area="student">
      <div className="-mx-4 -mt-6 sm:mx-0 sm:mt-0">
        <div className="flex items-center gap-1 px-2 py-1">
          <Link href="/student" aria-label="Back to deals" className="grid size-11 place-items-center rounded-full hover:bg-ink-100">
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
          <span className="flex-1" />
          <HeartButton merchantId={offer.merchant.id} saved={offer.is_favourite} back={back} label={offer.merchant.display_name} />
        </div>

        <section className="mx-4 flex flex-col gap-3.5 rounded-3xl p-5 sm:mx-0" style={{ background: tone.bg, color: tone.fg }}>
          <div className="flex items-center gap-3">
            <MerchantAvatar name={offer.merchant.display_name} category={here?.category_slug ?? null} size="lg" className="!bg-white" />
            <div>
              <b className="block">{offer.merchant.display_name}</b>
              <span className="text-sm opacity-80">{[here?.branch_area, offer.merchant.category].filter(Boolean).join(", ")}</span>
            </div>
          </div>
          <h1 className="font-display text-[2rem] leading-[1.05] font-extrabold tracking-tight">{offer.title}</h1>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/75 px-2.5 py-1 text-[0.8125rem] font-semibold">
              <CalendarClock className="size-3.5" aria-hidden />
              {offer.ends_at ? `Until ${formatDate(offer.ends_at)}` : "No end date"}
            </span>
            {walk && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/75 px-2.5 py-1 text-[0.8125rem] font-semibold">
                <Footprints className="size-3.5" aria-hidden /> {walk}
              </span>
            )}
          </div>
        </section>

        <section className="mx-4 mt-4 rounded-2xl bg-white p-4 ring-1 ring-ink-200/70 sm:mx-0">
          <dl className="divide-y divide-ink-200">
            <div className="flex justify-between gap-4 pb-2.5">
              <dt className="text-ink-700">{offer.item_name}</dt>
              <dd className="font-medium">{money(offer.regular_price)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-700">Student discount, {discountLabel(offer.discount_type, offer.discount_value)}</dt>
              <dd className="font-medium text-success">−{money(offer.discount_amount)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 pt-2.5">
              <dt className="font-semibold">You pay the shop</dt>
              <dd className="font-display text-2xl font-extrabold">{money(offer.final_price)}</dd>
            </div>
          </dl>
        </section>

        <section className="mx-4 mt-4 rounded-2xl bg-white p-4 ring-1 ring-ink-200/70 sm:mx-0" aria-labelledby="how-h">
          <h2 id="how-h" className="mb-3 text-sm font-bold text-ink-700">
            How to use it
          </h2>
          <ol className="space-y-3">
            {[
              "Order as usual and get served.",
              "Tap Scan and point at the Perqly QR at the counter.",
              "Show your live pass. The cashier confirms, you confirm, and you pay the student price.",
            ].map((t, i) => (
              <li key={t} className="flex items-start gap-3 text-[0.9375rem]">
                <span className="grid size-6.5 shrink-0 place-items-center rounded-full bg-blue-50 text-[0.8125rem] font-bold text-blue-700">
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-4 mt-4 rounded-2xl bg-white px-4 ring-1 ring-ink-200/70 sm:mx-0" aria-label="Details">
          <div className="flex items-center gap-3 border-b border-ink-200 py-3">
            <Repeat className="size-5 text-ink-600" aria-hidden />
            <span>
              {limitLabel(offer.per_student_limit, offer.per_student_period)}
              <small className="block text-[0.8125rem] text-ink-600">How often you can use it</small>
            </span>
          </div>
          <div className="flex items-center gap-3 border-b border-ink-200 py-3">
            <FileText className="size-5 shrink-0 text-ink-600" aria-hidden />
            <span>
              {offer.conditions}
              <small className="block text-[0.8125rem] text-ink-600">Conditions</small>
            </span>
          </div>
          {offer.branches.map((b) => (
            <div key={b.id} className="flex items-center gap-3 border-b border-ink-200 py-3 last:border-0">
              <MapPin className="size-5 shrink-0 text-ink-600" aria-hidden />
              <span className="min-w-0 flex-1">
                {b.name}
                <small className="block text-[0.8125rem] text-ink-600">
                  {[b.address, b.digital_address].filter(Boolean).join(", ") || "No address given"}
                </small>
                {b.opening_hours && (
                  <small className="flex items-center gap-1 text-[0.8125rem] text-ink-600">
                    <Clock className="size-3.5" aria-hidden /> {b.opening_hours}
                  </small>
                )}
              </span>
              {b.latitude !== null && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ size: "sm", variant: "secondary" })}
                >
                  Directions
                </a>
              )}
            </div>
          ))}
        </section>

        {others.length > 0 && (
          <section aria-labelledby="more-h">
            <h2 id="more-h" className="px-4 pt-6 pb-2 font-display text-lg font-bold sm:px-0">
              More at {offer.merchant.display_name}
            </h2>
            <ul className="space-y-2.5 px-4 sm:px-0">
              {others.map((d) => (
                <li key={d.offer_id}>
                  <DealRow deal={d} back={back} locked={!verified} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="sticky bottom-24 z-10 mt-4 bg-gradient-to-t from-paper from-70% px-4 pt-4 pb-2 sm:px-0 md:bottom-0">
          {verified ? (
            <Link href="/student/scan" className={`${buttonVariants({ size: "lg" })} w-full`}>
              <ScanLine aria-hidden /> Scan at the counter
            </Link>
          ) : (
            <Link
              href={view === "needs_profile" ? "/student/profile" : "/student/verify"}
              className={`${buttonVariants({ size: "lg" })} w-full !bg-ink-900`}
            >
              <Lock aria-hidden /> {view === "pending" ? "Unlocks when your school approves you" : "Verify to unlock this deal"}
            </Link>
          )}
        </div>
      </div>
    </AreaShell>
  );
}
