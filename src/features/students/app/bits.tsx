import Link from "next/link";
import { Footprints, Heart, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleFavourite } from "@/features/offers/actions";
import { CategoryIcon } from "@/features/offers/components/marketplace";
import type { Deal } from "@/features/offers/queries";

/** Category colours from the prototype, keyed by our category slugs. */
const CATEGORY_TONE: Record<string, { bg: string; fg: string }> = {
  food: { bg: "#FFEBD6", fg: "#9A3F07" },
  printing: { bg: "#DCE8FF", fg: "#0047B3" },
  beauty: { bg: "#FDE2EC", fg: "#9D174D" },
  tech: { bg: "#E2E8F0", fg: "#1E293B" },
  fashion: { bg: "#FEF0C3", fg: "#854D0E" },
  health: { bg: "#D9F2E5", fg: "#0B6B3D" },
  fitness: { bg: "#E0F2FE", fg: "#075985" },
  services: { bg: "#EDE9FE", fg: "#5B21B6" },
};
export const toneFor = (slug: string | null | undefined) => CATEGORY_TONE[slug ?? ""] ?? { bg: "#F1F5F9", fg: "#334155" };

/** The business's initials, from its real name. */
export function initials(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

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

/** Walking time at 80 m a minute, from the student's campus. Null when either location is unknown. */
export function walkLabel(distance: number | null | undefined) {
  if (distance === null || distance === undefined) return null;
  const minutes = Math.max(1, Math.ceil(distance / 80));
  return minutes <= 45 ? `${minutes} min walk` : `${(distance / 1000).toFixed(1)} km away`;
}

export function HeartButton({ merchantId, saved, back, label }: { merchantId: string; saved: boolean; back: string; label: string }) {
  return (
    <form action={toggleFavourite}>
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="save" value={saved ? "false" : "true"} />
      <input type="hidden" name="back" value={back} />
      <button
        type="submit"
        aria-pressed={saved}
        aria-label={saved ? `Remove ${label} from saved` : `Save ${label}`}
        className={cn("grid size-11 place-items-center rounded-full hover:bg-ink-100", saved ? "text-red-600" : "text-ink-600")}
      >
        <Heart className={cn("size-5", saved && "fill-current")} aria-hidden />
      </button>
    </form>
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
