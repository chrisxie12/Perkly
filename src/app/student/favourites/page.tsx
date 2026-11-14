import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Heart } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { listFavourites } from "@/features/offers/queries";
import { MerchantAvatar } from "@/features/students/app/bits";

export const metadata: Metadata = { title: "Saved shops", robots: { index: false } };

export default async function SavedPage() {
  const favourites = await listFavourites();
  return (
    <AreaShell area="student">
      <h1 className="mb-3 font-display text-xl font-bold">Saved shops</h1>
      {favourites.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className="mb-2 grid size-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <Heart className="size-7" aria-hidden />
          </span>
          <h2 className="font-display text-xl font-bold">No saved shops yet</h2>
          <p className="mt-1 max-w-[30ch] text-[0.9375rem] text-ink-600">Tap the heart on a deal and the shop lives here.</p>
          <Link href="/student" className={`${buttonVariants({ size: "sm" })} mt-4`}>
            Browse deals
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {favourites.map((f) => (
            <li key={f.merchant_id}>
              <Link
                href={`/student/merchants/${f.slug}`}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-ink-200/70"
              >
                <MerchantAvatar name={f.display_name} category={null} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink-900">{f.display_name}</span>
                  <span className="text-sm text-ink-600">
                    {f.category_name}, {Number(f.live_offers) === 1 ? "1 deal" : `${f.live_offers} deals`} now
                  </span>
                </span>
                <ChevronRight className="size-5 text-ink-600" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
