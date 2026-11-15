import Link from "next/link";
import { Footprints, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/features/offers/components/marketplace";
import type { Deal } from "@/features/offers/queries";
import { openLabel } from "@/features/merchants/hours";
import { initials, toneFor, walkLabel } from "./format";

export { initials, toneFor, walkLabel };
import { HeartButton } from "./heart-button";
export { HeartButton };

export function MerchantAvatar({
  name,
  category,
  size = "md",
  className,
}: {
  name: string;
  category: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const tone = toneFor(category);
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
        <MerchantAvatar name={deal.merchant_name} category={deal.category_slug} />
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
