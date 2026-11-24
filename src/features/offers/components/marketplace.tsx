import Link from "next/link";
import {
  Dumbbell,
  HeartPulse,
  Heart,
  LayoutGrid,
  Printer,
  Scissors,
  Shirt,
  Smartphone,
  Store,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { toggleFavourite } from "../actions";
import { discountLabel, money, type DiscountType } from "../schemas";

const ICONS: Record<string, LucideIcon> = {
  "layout-grid": LayoutGrid,
  utensils: Utensils,
  scissors: Scissors,
  printer: Printer,
  smartphone: Smartphone,
  shirt: Shirt,
  "heart-pulse": HeartPulse,
  dumbbell: Dumbbell,
  wrench: Wrench,
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Store;
  return <Icon className={className} aria-hidden />;
}

export function OfferCard({
  offer,
}: {
  offer: {
    offer_id: string;
    title: string;
    merchant_name: string;
    category_name: string;
    category_icon: string;
    regular_price: number;
    final_price: number;
    discount_type: DiscountType;
    discount_value: number;
  };
}) {
  return (
    <Link
      href={`/student/offers/${offer.offer_id}`}
      className="group block h-full overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70 transition-shadow hover:ring-blue-300 focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="flex items-center justify-between bg-blue-50 px-5 py-3 text-blue-700">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <CategoryIcon name={offer.category_icon} className="size-4" /> {offer.category_name}
        </span>
        <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-ink-900">
          {discountLabel(offer.discount_type, offer.discount_value)}
        </span>
      </div>
      <div className="px-5 pt-4 pb-5">
        <p className="font-display text-xl leading-tight font-extrabold tracking-tight text-ink-900">{offer.title}</p>
        <p className="mt-1 font-semibold text-ink-700">{offer.merchant_name}</p>
        <p className="mt-4 flex items-baseline gap-2">
          <span className="font-display text-2xl font-extrabold text-ink-900">{money(offer.final_price)}</span>
          <span className="text-ink-600 line-through">{money(offer.regular_price)}</span>
        </p>
      </div>
    </Link>
  );
}

export function FavouriteButton({ merchantId, saved, back }: { merchantId: string; saved: boolean; back: string }) {
  return (
    <form action={toggleFavourite}>
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="save" value={saved ? "false" : "true"} />
      <input type="hidden" name="back" value={back} />
      <SubmitButton variant="secondary" size="sm" aria-pressed={saved}>
        <Heart aria-hidden className={saved ? "fill-orange-500 text-orange-500" : undefined} /> {saved ? "Saved" : "Save"}
      </SubmitButton>
    </form>
  );
}
