import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Footprints,
  Lock,
  MapPin,
  Repeat,
  ScanLine,
  Star,
  Timer,
} from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { getCoverPhotos, getOffer, listDeals, savingShare } from "@/features/offers/queries";
import { CategoryIcon } from "@/features/offers/components/marketplace";
import { savingLabel } from "@/features/students/app/deal-card";
import { ShareButton } from "@/features/students/app/share-button";
import { getFeatureSwitches } from "@/features/platform/switches";
import { discountLabel, limitLabel, money } from "@/features/offers/schemas";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { formatDate } from "@/features/students/components/status-card";
import { DealRow, HeartButton, initials, toneFor, walkLabel } from "@/features/students/app/bits";
import { openLabel } from "@/features/merchants/hours";
import { formatRunTimes, isEveryDay } from "@/features/offers/run-times";
import { FriendsOnDeal } from "@/features/friends/components/friends-on-deal";

export const metadata: Metadata = { title: "Deal", robots: { index: false } };

export default async function DealPage({ params }: PageProps<"/student/offers/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [offer, status, switches] = await Promise.all([getOffer(id), getMyStudentStatus(), getFeatureSwitches()]);
  const cover = offer ? ((await getCoverPhotos([offer.merchant.id])).get(offer.merchant.id) ?? null) : null;
  if (!offer) notFound();
  const merchantDeals = await listDeals({ merchantId: offer.merchant.id });
  const here = merchantDeals.find((d) => d.offer_id === offer.offer_id);
  const others = merchantDeals.filter((d) => d.offer_id !== offer.offer_id);
  const view = verificationView(status);
  const verified = view === "verified";
  const tone = toneFor(here?.category_slug);
  const walk = walkLabel(here?.distance_m);
  const back = `/student/offers/${offer.offer_id}`;

  const open = here ? openLabel(here) : null;
  const share = here ? savingShare(here) : 0;
  const steps = [
    { title: "Order as usual", text: "Get served at the counter like anyone else." },
    { title: "Scan the shop's code", text: "Tap Scan and point at the Perqly QR at the counter." },
    { title: "Show your live pass", text: "The cashier confirms, you confirm, and you pay the student price." },
  ];
  const times = { run_days: here?.run_days ?? null, run_from: here?.run_from ?? null, run_until: here?.run_until ?? null };
  const notOnNow = here?.running_now === false;
  const facts = [
    {
      icon: Timer,
      label: "Student price runs",
      value: formatRunTimes(times),
      tone: isEveryDay(times) ? undefined : notOnNow ? undefined : "text-emerald-700",
    },
    { icon: CalendarClock, label: "Valid until", value: offer.ends_at ? formatDate(offer.ends_at) : "No end date" },
    {
      icon: Clock,
      label: "Opening",
      value: open?.text ?? (here?.opening_hours || "Hours not given"),
      tone: open?.open ? "text-emerald-700" : undefined,
    },
    { icon: Repeat, label: "How often", value: limitLabel(offer.per_student_limit, offer.per_student_period) },
    { icon: Footprints, label: "From campus", value: walk ?? "Distance unknown" },
  ];
  const iconButton = "grid size-11 place-items-center rounded-2xl bg-white text-ink-700 shadow-sm active:scale-90";

  return (
    <AreaShell area="student">
      <div className="-mx-4 -mt-6 sm:mx-0 sm:mt-0">
        <div className="relative h-[300px] overflow-hidden bg-ink-100 sm:rounded-[28px]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- public storage URL
            <img src={cover} alt={`${offer.merchant.display_name}`} className="size-full object-cover" />
          ) : (
            <div
              aria-hidden
              className="relative grid size-full place-items-center overflow-hidden"
              style={{ background: tone.bg, color: tone.fg }}
            >
              <CategoryIcon name={here?.category_icon ?? "store"} className="absolute -right-6 -bottom-8 size-56 opacity-15" />
              <span className="font-display text-7xl font-extrabold">{initials(offer.merchant.display_name)}</span>
            </div>
          )}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <Link href="/student" aria-label="Back to deals" className={iconButton}>
              <ChevronLeft className="size-6" aria-hidden />
            </Link>
            <div className="flex items-center gap-2">
              <ShareButton
                title={`${offer.title} at ${offer.merchant.display_name}`}
                path={`/d/${offer.offer_id}`}
                className={iconButton}
              />
              <span className="rounded-2xl bg-white shadow-sm">
                <HeartButton merchantId={offer.merchant.id} saved={offer.is_favourite} back={back} label={offer.merchant.display_name} />
              </span>
            </div>
          </div>
          {share >= 0.25 && (
            <span className="absolute bottom-5 left-5 flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-black tracking-widest text-blue-500 uppercase shadow-xl backdrop-blur-md">
              <Flame className="size-4 text-orange-500" aria-hidden /> Hot deal
            </span>
          )}
        </div>

        <div className="px-5 pt-7 sm:px-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="mb-1 text-[0.6875rem] font-bold tracking-[0.2em] text-ink-600 uppercase">
                {[offer.merchant.category, here?.branch_area].filter(Boolean).join(" · ")}
              </p>
              <h1 className="font-display text-[2.25rem] leading-[1.02] font-black tracking-tight text-ink-900">
                <Link href={`/student/merchants/${offer.merchant.slug}`} className="hover:underline">
                  {offer.merchant.display_name}
                </Link>
              </h1>
            </div>
            {here?.rating && here.reviews ? (
              <Link
                href={`/student/merchants/${offer.merchant.slug}#ratings`}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-600"
              >
                <Star className="size-4 fill-blue-500 text-blue-500" aria-hidden /> {here.rating.toFixed(1)}
                <span className="sr-only"> stars from {here.reviews} ratings</span>
              </Link>
            ) : null}
          </div>

          <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-5xl leading-none font-black text-blue-500 uppercase italic">
              {here ? savingLabel(here) : discountLabel(offer.discount_type, offer.discount_value)}
            </span>
            <span className="text-lg font-bold text-ink-600">{offer.item_name}</span>
          </p>
          {offer.title.trim().toLowerCase() !== offer.item_name.trim().toLowerCase() && (
            <p className="mt-3 text-[1.0625rem] leading-relaxed font-medium text-ink-700">{offer.title}</p>
          )}

          <section className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-ink-200/70" aria-label="Price">
            <dl className="divide-y divide-ink-200">
              <div className="flex justify-between gap-4 pb-2.5">
                <dt className="text-ink-700">{offer.item_name}</dt>
                <dd className="font-medium">{money(offer.regular_price)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-ink-700">Student discount</dt>
                <dd className="font-medium text-success">−{money(offer.discount_amount)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 pt-2.5">
                <dt className="font-semibold">You pay the shop</dt>
                <dd className="font-display text-2xl font-extrabold">{money(offer.final_price)}</dd>
              </div>
            </dl>
          </section>

          <ul className="mt-4 grid grid-cols-2 gap-3">
            {facts.map((f) => (
              <li key={f.label} className="rounded-3xl bg-white p-4 ring-1 ring-ink-200/70">
                <f.icon className="mb-2 size-5 text-blue-500" aria-hidden />
                <span className="block text-[0.6875rem] font-bold tracking-widest text-ink-600 uppercase">{f.label}</span>
                <span className={`block text-sm font-bold text-ink-900 ${f.tone ?? ""}`}>{f.value}</span>
              </li>
            ))}
          </ul>

          {verified && switches.friends && (
            <Suspense fallback={null}>
              <FriendsOnDeal offerId={offer.offer_id} />
            </Suspense>
          )}

          <section className="mt-8" aria-labelledby="how-h">
            <h2 id="how-h" className="mb-4 font-display text-xl font-black text-ink-900">
              How to redeem
            </h2>
            <ol className="flex flex-col gap-5">
              {steps.map((st, i) => (
                <li key={st.title} className="flex gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-500 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="text-sm font-medium text-ink-600">
                    <span className="block font-bold text-ink-900">{st.title}</span>
                    {st.text}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-8" aria-labelledby="terms-h">
            <h2 id="terms-h" className="mb-4 font-display text-xl font-black text-ink-900">
              Terms
            </h2>
            <ul className="space-y-3">
              {[
                offer.conditions,
                limitLabel(offer.per_student_limit, offer.per_student_period),
                "Show your live Perqly pass. Screenshots don't work.",
              ]
                .filter(Boolean)
                .map((t) => (
                  <li key={t} className="flex gap-3 text-sm font-medium text-ink-600">
                    <AlertCircle className="size-4.5 shrink-0 text-orange-500" aria-hidden /> {t}
                  </li>
                ))}
            </ul>
          </section>

          <section className="mt-8" aria-labelledby="where-h">
            <h2 id="where-h" className="mb-3 font-display text-xl font-black text-ink-900">
              Where
            </h2>
            <div className="rounded-3xl bg-white px-4 ring-1 ring-ink-200/70">
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
            </div>
          </section>
        </div>

        {others.length > 0 && (
          <section aria-labelledby="more-h">
            <h2 id="more-h" className="px-5 pt-8 pb-3 font-display text-xl font-black text-ink-900 sm:px-1">
              More from {offer.merchant.display_name}
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

        <div className="sticky bottom-[calc(var(--frame-bottom,7rem)-1rem)] z-10 mt-6 bg-gradient-to-t from-paper from-70% px-4 pt-4 pb-2 sm:px-0 md:bottom-0">
          {verified && notOnNow ? (
            <p className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink-100 px-4 text-center text-[0.9375rem] font-semibold text-ink-700">
              <Timer className="size-5 shrink-0" aria-hidden /> Not on right now. The student price runs {formatRunTimes(times)}.
            </p>
          ) : verified ? (
            <Link
              href="/student/scan"
              className="text-on-lime flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 text-base font-bold shadow-lg transition-transform hover:brightness-105 active:scale-[0.98]"
            >
              <ScanLine className="size-5" aria-hidden /> Scan at the counter <ChevronRight className="size-5" aria-hidden />
            </Link>
          ) : (
            <Link
              href={view === "needs_profile" ? "/student/profile" : "/student/verify"}
              className={`${buttonVariants({ size: "lg" })} w-full !bg-ink-900`}
            >
              <Lock aria-hidden /> {view === "pending" ? "Unlocks when you're verified" : "Verify to redeem"}
            </Link>
          )}
        </div>
      </div>
    </AreaShell>
  );
}
