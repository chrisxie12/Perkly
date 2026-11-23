import Link from "next/link";
import { ChevronRight, Lock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/features/offers/components/marketplace";
import type { Deal } from "@/features/offers/queries";
import { isEveryDay } from "@/features/offers/run-times";
import { initials, percentOff, postedLabel, toneFor } from "./format";
import { HeartButton } from "./heart-button";
import { OpenTag, RunTimesTag } from "./bits";

/** A deal's run times, with missing fields read as every day. */
const runTimesOf = (d: Deal) => ({
  run_days: d.run_days ?? null,
  run_from: d.run_from ?? null,
  run_until: d.run_until ?? null,
  running_now: d.running_now,
});

const cedis = (n: number) => `GH₵${Number(n).toFixed(2)}`;
/** "GH₵20" for whole amounts, "GH₵7.50" otherwise: shorter, so the price and saving fit on one line. */
const shortCedis = (n: number) => `GH₵${Number.isInteger(Number(n)) ? Number(n) : Number(n).toFixed(2)}`;

/** "25% OFF" or "GH₵10 OFF": what the student saves. */
export function savingLabel(deal: Pick<Deal, "discount_type" | "discount_value" | "discount_amount">) {
  if (deal.discount_type === "percentage") return `${Number(deal.discount_value)}% off`;
  const off = Number(deal.discount_amount);
  return `GH₵${Number.isInteger(off) ? off : off.toFixed(2)} off`;
}

/** "350 m away", "1.2 km away". */
export function distanceLabel(m: number | null | undefined) {
  if (m === null || m === undefined) return null;
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m away`;
  return `${(m / 1000).toFixed(1)} km away`;
}

export function RatingTag({ rating, reviews, className }: { rating?: number | null; reviews?: number; className?: string }) {
  if (!rating || !reviews) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold text-ink-900", className)}>
      <Star className="size-3.5 fill-orange-500 text-orange-500" aria-hidden />
      {rating.toFixed(1)}
      <span className="font-normal text-ink-600">({reviews})</span>
      <span className="sr-only">
        {" "}
        stars from {reviews} {reviews === 1 ? "rating" : "ratings"}
      </span>
    </span>
  );
}

/** The shop's cover photo, or a coloured panel with its category icon and initials. */
function DealPhoto({ deal, closed, small = false }: { deal: Deal; closed: boolean; small?: boolean }) {
  if (deal.cover_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- public storage URL
      <img
        src={deal.cover_url}
        alt=""
        loading="lazy"
        className={cn(
          "size-full object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none",
          closed && "brightness-75 grayscale-[35%]",
        )}
      />
    );
  }
  const tone = toneFor(deal.category_slug);
  return (
    <span
      aria-hidden
      className={cn("relative grid size-full place-items-center overflow-hidden", closed && "opacity-80")}
      style={{ background: tone.bg, color: tone.fg }}
    >
      <CategoryIcon
        name={deal.category_icon ?? "store"}
        className={cn("absolute opacity-15", small ? "-right-3 -bottom-3 size-20" : "-right-4 -bottom-5 size-32")}
      />
      <span className={cn("font-display font-extrabold", small ? "text-3xl" : "text-5xl")}>{initials(deal.merchant_name)}</span>
    </span>
  );
}

/** The heart, or a lock until the student is verified. */
function SaveOrLock({ deal, back, locked }: { deal: Deal; back: string; locked: boolean }) {
  return (
    <span className="rounded-2xl bg-ink-50">
      {locked ? (
        <span className="grid size-11 place-items-center text-ink-600" title="Verify to redeem">
          <Lock className="size-5" aria-hidden />
          <span className="sr-only">Redeem after verification</span>
        </span>
      ) : (
        <HeartButton merchantId={deal.merchant_id} saved={deal.is_favourite} back={back} label={deal.merchant_name} />
      )}
    </span>
  );
}

/**
 * A deal in the main list: small photo on the left, the details on the right,
 * the price as the biggest thing, and one button. Short enough that two or
 * three fit on a phone screen.
 */
export function DealCard({
  deal,
  back,
  locked,
  compact = false,
}: {
  deal: Deal;
  back: string;
  locked: boolean;
  /** Narrower photo-on-top card for the sideways rows ("On today", "Open now"). */
  compact?: boolean;
}) {
  if (compact) return <CompactDealCard deal={deal} back={back} locked={locked} />;
  const closed = Boolean(deal.has_hours && !deal.open_now);
  const away = distanceLabel(deal.distance_m);
  const posted = postedLabel(deal.published_at);
  const off = percentOff(deal.regular_price, deal.final_price);
  const href = `/student/offers/${deal.offer_id}`;
  return (
    <article className="group min-w-0 rounded-[24px] bg-white p-3 ring-1 ring-ink-200/70 transition-shadow hover:shadow-[0_20px_40px_-16px_rgba(0,0,0,0.12)]">
      <Link href={href} className="flex gap-3 rounded-[18px] focus-visible:outline-none">
        <span className="relative size-28 shrink-0 overflow-hidden rounded-[18px] bg-ink-100 sm:size-32">
          <DealPhoto deal={deal} closed={closed} small />
          {closed && (
            <span className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-black/70 px-2 py-1 text-center text-[0.6875rem] font-semibold text-white">
              Closed
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-ink-600">
            <span className="truncate font-semibold text-ink-900">{deal.merchant_name}</span>
            {away && (
              <>
                <span aria-hidden>·</span>
                <span className="shrink-0">{away}</span>
              </>
            )}
          </span>
          <span className="mt-0.5 line-clamp-2 text-[1.0625rem] leading-snug font-bold tracking-tight text-ink-900">{deal.title}</span>
          <span className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-[1.375rem] leading-none font-extrabold tracking-tight text-blue-700">
              {shortCedis(deal.final_price)}
            </span>
            {off !== null && (
              <>
                <s className="text-sm text-ink-600">{shortCedis(deal.regular_price)}</s>
                <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-bold text-blue-700">-{off}%</span>
              </>
            )}
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[0.8125rem] text-ink-600">
            {closed && deal.opens_next ? <span>Opens {deal.opens_next}</span> : deal.has_hours && <OpenTag deal={deal} />}
            {!isEveryDay(runTimesOf(deal)) && <RunTimesTag deal={runTimesOf(deal)} />}
            <RatingTag rating={deal.rating} reviews={deal.reviews} />
            {posted && !deal.has_hours && isEveryDay(runTimesOf(deal)) && <span>{posted}</span>}
          </span>
        </span>
      </Link>
      <span className="flex items-center gap-2 pt-3">
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden
          className="text-on-lime flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-orange-500 text-[0.9375rem] font-bold shadow-sm transition-transform hover:brightness-105 active:scale-[0.98]"
        >
          {locked ? "Verify to unlock this price" : "Get this deal"} <ChevronRight className="size-4" />
        </Link>
        <SaveOrLock deal={deal} back={back} locked={locked} />
      </span>
    </article>
  );
}

/** The photo-on-top card, kept for the sideways rows. */
function CompactDealCard({ deal, back, locked }: { deal: Deal; back: string; locked: boolean }) {
  const closed = Boolean(deal.has_hours && !deal.open_now);
  const away = distanceLabel(deal.distance_m);
  const href = `/student/offers/${deal.offer_id}`;
  return (
    <article className="group flex h-full min-w-0 flex-col rounded-[28px] bg-white p-2 ring-1 ring-ink-200/70 transition-shadow hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.08)]">
      <Link href={href} className="flex flex-1 flex-col rounded-[22px] focus-visible:outline-none">
        <span className="relative block h-36 overflow-hidden rounded-[22px] bg-ink-100">
          <DealPhoto deal={deal} closed={closed} />
          {closed && (
            <span className="absolute bottom-3 left-3 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white">
              Closed{deal.opens_next ? `, opens ${deal.opens_next}` : ""}
            </span>
          )}
        </span>
        <span className="flex flex-1 flex-col px-2.5 pt-3">
          <span className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-medium text-ink-600">
            <CategoryIcon name={deal.category_icon ?? "store"} className="size-3.5 shrink-0" />
            <span className="truncate">{deal.category_name}</span>
            {away && (
              <>
                <span aria-hidden>·</span>
                <span className="shrink-0">{away}</span>
              </>
            )}
          </span>
          <span className="mt-1 flex items-start justify-between gap-3">
            <span className="line-clamp-2 min-w-0 font-display text-lg leading-tight font-extrabold tracking-tight text-ink-900">
              {deal.merchant_name}
            </span>
            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold whitespace-nowrap text-blue-700">
              {savingLabel(deal)}
            </span>
          </span>
          <span className="mt-1 line-clamp-1 text-sm font-medium text-ink-600">{deal.title}</span>
          <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2.5 text-[0.8125rem] text-ink-600">
            <span className="font-bold text-ink-900">
              {cedis(deal.final_price)} <s className="font-normal text-ink-600">{cedis(deal.regular_price)}</s>
            </span>
            <RatingTag rating={deal.rating} reviews={deal.reviews} />
          </span>
          {!isEveryDay(runTimesOf(deal)) && <RunTimesTag deal={runTimesOf(deal)} className="mt-1.5 text-[0.8125rem]" />}
        </span>
      </Link>
      <span className="flex items-center gap-2 px-0.5 pt-3 pb-0.5">
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden
          className="text-on-lime flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-orange-500 text-sm font-bold shadow-sm transition-transform hover:brightness-105 active:scale-[0.98]"
        >
          {locked ? "Verify to unlock this price" : "Get this deal"} <ChevronRight className="size-4" />
        </Link>
        <SaveOrLock deal={deal} back={back} locked={locked} />
      </span>
    </article>
  );
}
