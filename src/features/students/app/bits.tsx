import Link from "next/link";
import { Clock, Footprints, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/features/offers/components/marketplace";
import type { Deal } from "@/features/offers/queries";
import { openLabel } from "@/features/merchants/hours";
import { formatRunTimes, isEveryDay, type RunTimes } from "@/features/offers/run-times";
import { initials, toneFor, walkLabel } from "./format";

export { initials, toneFor, walkLabel };
import { HeartButton } from "./heart-button";
export { HeartButton };

export function MerchantAvatar({
  name,
  category,
  size = "md",
  className,
  photo,
}: {
  name: string;
  category: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** The shop's cover photo; initials are shown when there is none. */
  photo?: string | null;
}) {
  const tone = toneFor(category);
  const box = cn(
    "shrink-0",
    size === "sm" && "size-9 rounded-lg",
    size === "md" && "size-11 rounded-xl",
    size === "lg" && "size-16 rounded-2xl",
    className,
  );
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element -- public storage URL
    return <img src={photo} alt="" aria-hidden loading="lazy" className={cn(box, "bg-ink-100 object-cover")} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center font-display font-bold",
        size === "sm" && "size-9 rounded-lg text-sm",
        size === "md" && "size-11 rounded-xl text-base",
        size === "lg" && "size-16 rounded-2xl text-xl",
        className,
      )}
      style={{ background: tone.bg, color: tone.fg }}
    >
      {initials(name)}
    </span>
  );
}

export function OpenTag({ deal }: { deal: Pick<Deal, "has_hours" | "open_now" | "open_until" | "opens_next"> }) {
  const label = openLabel(deal);
  if (!label) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-semibold", label.open ? "text-emerald-700" : "text-ink-600")}>
      <span className={cn("size-2 rounded-full", label.open ? "bg-emerald-600" : "bg-slate-400")} aria-hidden />
      {label.text}
    </span>
  );
}

export function DealRow({ deal, back, locked }: { deal: Deal; back: string; locked: boolean }) {
  const walk = walkLabel(deal.distance_m);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white py-3 pr-1 pl-3 ring-1 ring-ink-200/70">
      <Link href={`/student/offers/${deal.offer_id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <MerchantAvatar name={deal.merchant_name} category={deal.category_slug} photo={deal.cover_url} />
        <span className="min-w-0 flex-1">
          <span className="block leading-snug font-bold text-ink-900">{deal.title}</span>
          <span className="block truncate text-sm text-ink-600">
            {deal.merchant_name}
            {deal.branch_area ? `, ${deal.branch_area}` : ""}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[0.8125rem] text-ink-600">
            <span className="font-semibold text-ink-900">
              GH₵{Number(deal.final_price).toFixed(2)}{" "}
              <s className="font-normal text-ink-600">GH₵{Number(deal.regular_price).toFixed(2)}</s>
            </span>
            <OpenTag deal={deal} />
            {walk && (
              <span className="inline-flex items-center gap-1">
                <Footprints className="size-3.5" aria-hidden /> {walk}
              </span>
            )}
          </span>
        </span>
      </Link>
      {locked ? (
        <span className="grid size-11 place-items-center text-ink-600" title="Verify to redeem">
          <Lock className="size-5" aria-hidden />
          <span className="sr-only">Redeem after verification</span>
        </span>
      ) : (
        <HeartButton merchantId={deal.merchant_id} saved={deal.is_favourite} back={back} label={deal.merchant_name} />
      )}
    </div>
  );
}

export function CategoryChip({ href, active, icon, label }: { href: string; active: boolean; icon?: string; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap ring-1",
        active ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-700 ring-ink-200 hover:bg-ink-100",
      )}
    >
      {icon && <CategoryIcon name={icon} className="size-4" />}
      {label}
    </Link>
  );
}

/**
 * 3D icons (Microsoft Fluent Emoji, MIT licence: public/icons/3d/LICENSE-fluent-emoji.txt), by
 * category icon name. A category whose icon isn't here keeps its drawn icon.
 */
const ICONS_3D = new Set(["all", "utensils", "scissors", "printer", "smartphone", "shirt", "heart-pulse", "dumbbell", "wrench"]);

/** A category as a big tinted tile with its label underneath (Home). */
export function CategoryTile({
  href,
  active,
  icon,
  label,
  slug,
}: {
  href: string;
  active: boolean;
  icon?: string;
  label: string;
  slug?: string;
}) {
  const tone = slug ? toneFor(slug) : { bg: "#EEF2F7", fg: "#334155" };
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="flex w-[4.75rem] shrink-0 flex-col items-center gap-2 text-center text-[0.8125rem] leading-tight font-semibold text-ink-900"
    >
      {/* Raised, glossy tile with a 3D icon. */}
      <span
        className={cn(
          "relative grid size-16 place-items-center overflow-hidden rounded-[20px] transition-transform active:scale-95",
          active && "outline-[2.5px] outline-offset-[3px] outline-blue-500 outline-solid",
        )}
        style={{
          background: `linear-gradient(155deg, color-mix(in srgb, ${tone.bg} 45%, white) 0%, ${tone.bg} 55%, color-mix(in srgb, ${tone.bg} 82%, ${tone.fg}) 100%)`,
          boxShadow: `inset 0 2px 1px rgba(255,255,255,0.85), inset 0 -3px 6px color-mix(in srgb, ${tone.fg} 14%, transparent), 0 10px 18px -10px color-mix(in srgb, ${tone.fg} 55%, transparent)`,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1.5 top-1 h-6 rounded-t-[16px] bg-gradient-to-b from-white/70 to-white/0"
        />
        {ICONS_3D.has(icon ?? "") ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny local icon, no optimisation needed
          <img
            src={`/icons/3d/${icon}.webp`}
            alt=""
            width={40}
            height={40}
            className="relative size-10 drop-shadow-[0_4px_4px_rgba(0,0,0,0.12)]"
          />
        ) : (
          <CategoryIcon name={icon ?? "store"} className="relative size-8 stroke-[2.4]" style={{ color: tone.fg }} />
        )}
      </span>
      <span className="line-clamp-2">{label}</span>
    </Link>
  );
}

/** When a deal with set days or times runs, and whether it's on now. Nothing for every-day deals. */
export function RunTimesTag({ deal, className }: { deal: RunTimes & { running_now?: boolean }; className?: string }) {
  if (isEveryDay(deal)) return null;
  const on = deal.running_now !== false;
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", on ? "text-green-700" : "text-ink-600", className)}>
      <Clock className="size-3.5 shrink-0" aria-hidden />
      {on ? "On now · " : "Not on now · "}
      {formatRunTimes(deal)}
    </span>
  );
}
