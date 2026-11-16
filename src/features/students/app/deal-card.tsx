import Link from "next/link";
import { Footprints, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/features/offers/components/marketplace";
import type { Deal } from "@/features/offers/queries";
import { initials, toneFor, walkLabel } from "./format";
import { HeartButton } from "./heart-button";
import { OpenTag } from "./bits";

const cedis = (n: number) => `GH₵${Number(n).toFixed(2)}`;

/** "20% off" or "GH₵10 off": what the student saves, shown on the photo. */
export function savingLabel(deal: Pick<Deal, "discount_type" | "discount_value" | "discount_amount">) {
  if (deal.discount_type === "percentage") return `${Number(deal.discount_value)}% off`;
  const off = Number(deal.discount_amount);
  return `GH₵${Number.isInteger(off) ? off : off.toFixed(2)} off`;
}

/** The shop's cover photo, or a coloured panel with its category icon and initials. */
function DealPhoto({ deal, className }: { deal: Deal; className?: string }) {
  const closed = deal.has_hours && !deal.open_now;
  if (deal.cover_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- public storage URL
      <img
        src={deal.cover_url}
        alt=""
        loading="lazy"
        className={cn("size-full bg-ink-100 object-cover", closed && "brightness-75 grayscale-[35%]", className)}
      />
    );
  }
  const tone = toneFor(deal.category_slug);
  return (
    <span
      aria-hidden
      className={cn("relative grid size-full place-items-center overflow-hidden", closed && "opacity-80", className)}
      style={{ background: tone.bg, color: tone.fg }}
    >
      <CategoryIcon name={deal.category_icon ?? "store"} className="absolute -right-4 -bottom-5 size-28 opacity-15" />
      <span className="font-display text-4xl font-bold">{initials(deal.merchant_name)}</span>
    </span>
  );
}

/**
 * A deal as a food-app style card: big photo, saving on the photo,
 * then the deal, the shop and the price.
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
  /** Narrower card for the sideways "Open now" row. */
  compact?: boolean;
}) {
  const walk = walkLabel(deal.distance_m);
  const closed = deal.has_hours && !deal.open_now;
  return (
    <article className="relative h-full overflow-hidden rounded-2xl bg-white ring-1 ring-ink-200/70">
      <Link href={`/student/offers/${deal.offer_id}`} className="flex h-full flex-col focus-visible:outline-none">
        <span className={cn("relative block", compact ? "aspect-[4/3]" : "aspect-[16/9]")}>
          <DealPhoto deal={deal} />
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-orange-500 px-2.5 py-1 text-[0.8125rem] font-bold text-white shadow-sm">
            {savingLabel(deal)}
          </span>
          {closed && (
            <span className="absolute top-2.5 left-2.5 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white">
              Closed{deal.opens_next ? `, opens ${deal.opens_next}` : ""}
            </span>
          )}
        </span>
        <span className="flex flex-1 flex-col px-3.5 pt-3 pb-3.5">
          <span className={cn("leading-snug font-bold text-ink-900", compact ? "line-clamp-2" : "line-clamp-1 text-[1.0625rem]")}>
            {deal.title}
          </span>
          <span className="mt-0.5 truncate text-sm text-ink-600">
            {deal.merchant_name}
            {deal.branch_area ? `, ${deal.branch_area}` : ""}
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[0.8125rem] text-ink-600">
            <span className="text-[0.9375rem] font-bold text-ink-900">
              {cedis(deal.final_price)} <s className="text-[0.8125rem] font-normal text-ink-600">{cedis(deal.regular_price)}</s>
            </span>
            {!closed && deal.has_hours && <OpenTag deal={deal} />}
            {walk && (
              <span className="inline-flex items-center gap-1">
                <Footprints className="size-3.5" aria-hidden /> {walk}
              </span>
            )}
          </span>
        </span>
      </Link>
      <span className="absolute top-2 right-2 rounded-full bg-white/90 shadow-sm backdrop-blur-sm">
        {locked ? (
          <span className="grid size-11 place-items-center text-ink-600" title="Verify to redeem">
            <Lock className="size-5" aria-hidden />
            <span className="sr-only">Redeem after verification</span>
          </span>
        ) : (
          <HeartButton merchantId={deal.merchant_id} saved={deal.is_favourite} back={back} label={deal.merchant_name} />
        )}
      </span>
    </article>
  );
}
