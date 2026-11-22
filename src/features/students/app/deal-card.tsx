import Link from "next/link";
import { ChevronRight, Lock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/features/offers/components/marketplace";
import type { Deal } from "@/features/offers/queries";
import { isEveryDay } from "@/features/offers/run-times";
import { initials, toneFor } from "./format";
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
function DealPhoto({ deal, closed }: { deal: Deal; closed: boolean }) {
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
      <CategoryIcon name={deal.category_icon ?? "store"} className="absolute -right-4 -bottom-5 size-32 opacity-15" />
      <span className="font-display text-5xl font-extrabold">{initials(deal.merchant_name)}</span>
    </span>
  );
}

/** A deal card: big photo with category and distance, the shop and its saving, then a lime button. */
export function DealCard({
  deal,
  back,
  locked,
  compact = false,
}: {
  deal: Deal;
  back: string;
  locked: boolean;
  /** Narrower card for the sideways "Open now" row. */
  compact?: boolean;
}) {
  const closed = Boolean(deal.has_hours && !deal.open_now);
  const away = distanceLabel(deal.distance_m);
  const href = `/student/offers/${deal.offer_id}`;
  return (
    <article className="group flex h-full min-w-0 flex-col rounded-[28px] bg-white p-2 ring-1 ring-ink-200/70 transition-shadow hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.08)]">
      <Link href={href} className="flex flex-1 flex-col rounded-[22px] focus-visible:outline-none">
        <span className={cn("relative block overflow-hidden rounded-[22px] bg-ink-100", compact ? "h-36" : "h-52")}>
          <DealPhoto deal={deal} closed={closed} />
          {closed && (
            <span className="absolute bottom-3 left-3 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white">
              Closed{deal.opens_next ? `, opens ${deal.opens_next}` : ""}
            </span>
          )}
        </span>
        <span className={cn("flex flex-1 flex-col", compact ? "px-2.5 pt-3" : "px-3 pt-3.5")}>
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
            <span
              className={cn(
                "min-w-0 font-display leading-tight font-extrabold tracking-tight text-ink-900",
                compact ? "line-clamp-2 text-lg" : "line-clamp-2 text-[1.375rem]",
              )}
            >
              {deal.merchant_name}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full bg-blue-50 px-2.5 py-1 font-bold whitespace-nowrap text-blue-700",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {savingLabel(deal)}
            </span>
          </span>
          <span className={cn("mt-1 font-medium text-ink-600", compact ? "line-clamp-1 text-sm" : "line-clamp-2 text-[0.9375rem]")}>
            {deal.title}
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2.5 text-[0.8125rem] text-ink-600">
            <span className="font-bold text-ink-900">
              {cedis(deal.final_price)} <s className="font-normal text-ink-600">{cedis(deal.regular_price)}</s>
            </span>
            <RatingTag rating={deal.rating} reviews={deal.reviews} />
            {!compact && !closed && deal.has_hours && <OpenTag deal={deal} />}
          </span>
          {!isEveryDay(runTimesOf(deal)) && <RunTimesTag deal={runTimesOf(deal)} className="mt-1.5 text-[0.8125rem]" />}
        </span>
      </Link>
      <span className={cn("flex items-center gap-2", compact ? "px-0.5 pt-3 pb-0.5" : "px-1 pt-4 pb-1")}>
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden
          className={cn(
            "text-on-lime flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-lime-400 font-bold shadow-sm transition-transform hover:brightness-105 active:scale-[0.98]",
            compact ? "h-11 text-sm" : "h-13 text-[0.9375rem]",
          )}
        >
          {locked ? "See deal" : "Get this deal"} <ChevronRight className="size-4" />
        </Link>
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
      </span>
    </article>
  );
}
