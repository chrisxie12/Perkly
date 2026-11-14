import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/states";
import { cn } from "@/lib/utils";
import { getCategories } from "@/features/merchants/queries";
import { CategoryIcon, OfferCard } from "@/features/offers/components/marketplace";
import { listOffers } from "@/features/offers/queries";

export const metadata: Metadata = { title: "Explore offers", robots: { index: false } };

export default async function ExplorePage({ searchParams }: PageProps<"/student/explore">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const category = typeof params.category === "string" ? params.category : "";
  const [categories, offers] = await Promise.all([
    getCategories(),
    listOffers({ query: query || undefined, category: category || undefined }),
  ]);

  return (
    <AreaShell area="student">
      <PageTitle
        title="Explore"
        description="Student prices at businesses near campus. Pay the business directly; Perqly never takes payment."
      />

      <form role="search" action="/student/explore" className="mb-5 flex gap-2">
        {category && <input type="hidden" name="category" value={category} />}
        <label htmlFor="q" className="sr-only">
          Search offers
        </label>
        <Input id="q" name="q" defaultValue={query} placeholder="Search haircuts, food, printing…" className="flex-1" />
        <Button type="submit" variant="secondary" size="lg" aria-label="Search">
          <Search aria-hidden />
        </Button>
      </form>

      <nav aria-label="Categories" className="-mx-5 mb-8 flex gap-2 overflow-x-auto px-5 pb-1">
        <Link
          href={query ? `/student/explore?q=${encodeURIComponent(query)}` : "/student/explore"}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap ring-1",
            !category ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-700 ring-ink-200 hover:bg-ink-100",
          )}
        >
          All
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/student/explore?category=${c.slug}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            aria-current={category === c.slug ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap ring-1",
              category === c.slug ? "bg-ink-900 text-white ring-ink-900" : "bg-white text-ink-700 ring-ink-200 hover:bg-ink-100",
            )}
          >
            <CategoryIcon name={c.icon} className="size-4" /> {c.name}
          </Link>
        ))}
      </nav>

      {offers.length === 0 ? (
        <EmptyState
          title={query || category ? "Nothing matches yet" : "No offers yet"}
          description={
            query || category
              ? "Try another search or category."
              : "Businesses near campus are joining Perqly. Their student offers will appear here."
          }
          action={
            query || category ? (
              <Link href="/student/explore" className="font-semibold text-blue-600 underline underline-offset-2">
                Show all offers
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer) => (
            <li key={offer.offer_id}>
              <OfferCard offer={offer} />
            </li>
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
