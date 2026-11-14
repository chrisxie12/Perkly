import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { CategoryIcon } from "@/features/offers/components/marketplace";
import { listFavourites } from "@/features/offers/queries";

export const metadata: Metadata = { title: "Saved businesses", robots: { index: false } };

export default async function FavouritesPage() {
  const favourites = await listFavourites();
  return (
    <AreaShell area="student">
      <PageTitle title="Saved businesses" description="Businesses you've saved. Businesses that leave Perqly disappear from this list." />
      {favourites.length === 0 ? (
        <EmptyState
          icon={<Heart />}
          title="Nothing saved yet"
          description="Tap Save on a business or offer to keep it here."
          action={
            <Link href="/student/explore" className="font-semibold text-blue-600 underline underline-offset-2">
              Browse offers
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl bg-white shadow-soft ring-1 ring-ink-200/70">
          {favourites.map((f) => (
            <li key={f.merchant_id}>
              <Link href={`/student/merchants/${f.slug}`} className="flex items-center gap-4 p-5 hover:bg-ink-50">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <CategoryIcon name={f.category_icon} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink-900">{f.display_name}</span>
                  <span className="text-sm text-ink-600">
                    {f.category_name}, {Number(f.live_offers) === 1 ? "1 offer" : `${f.live_offers} offers`}
                  </span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-blue-500" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
