import type { Metadata } from "next";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { CategoryChip } from "@/features/students/app/bits";
import { CATEGORIES, FILTERS, isCategory, isFilter, recentlyAdded } from "@/features/resources/model";
import { listResources } from "@/features/resources/queries";
import { FeaturedResourceCard, ResourceCard } from "@/features/resources/components/resource-card";

export const metadata: Metadata = { title: "Student resources", robots: { index: false } };

function link(params: { q?: string; category?: string; filter?: string }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.category) sp.set("category", params.category);
  if (params.filter) sp.set("filter", params.filter);
  const s = sp.toString();
  return s ? `/student/resources?${s}` : "/student/resources";
}

export default async function ResourcesPage({ searchParams }: PageProps<"/student/resources">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const category = isCategory(sp.category) ? sp.category : undefined;
  const filter = isFilter(sp.filter) ? sp.filter : undefined;
  const browsing = !q && !category && !filter;
  const list = await listResources({ q: q || undefined, category, filter });
  const featured = browsing ? list.filter((r) => r.featured) : [];
  const recent = browsing ? recentlyAdded(list, 4) : [];

  return (
    <AreaShell area="student">
      <header className="mb-4">
        <h1 className="font-display text-3xl leading-tight font-extrabold tracking-tight">Student resources</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-600">
          Free tools, student plans, courses and opportunities you can use from Ghana. No Perqly verification needed.
        </p>
      </header>

      <form action="/student/resources" role="search" className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-500" aria-hidden />
        <label htmlFor="resource-q" className="sr-only">
          Search resources
        </label>
        <input
          id="resource-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search tools, courses, providers"
          className="h-12 w-full rounded-2xl bg-white pr-4 pl-12 text-base ring-1 ring-ink-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        />
        {category && <input type="hidden" name="category" value={category} />}
        {filter && <input type="hidden" name="filter" value={filter} />}
      </form>

      <nav
        aria-label="Categories"
        className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] px-4 pb-2 sm:mx-0 sm:px-0"
      >
        <CategoryChip href={link({ q, filter })} active={!category} label="All" />
        {CATEGORIES.map((c) => (
          <CategoryChip key={c.value} href={link({ q, filter, category: c.value })} active={category === c.value} label={c.short} />
        ))}
      </nav>
      <nav aria-label="Eligibility" className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={link({ q, category, filter: filter === f.value ? undefined : f.value })}
            aria-current={filter === f.value ? "true" : undefined}
            className={
              filter === f.value
                ? "rounded-full bg-blue-600 px-3 py-1.5 text-[0.8125rem] font-semibold text-white"
                : "rounded-full bg-ink-50 px-3 py-1.5 text-[0.8125rem] font-semibold text-ink-700 ring-1 ring-ink-200"
            }
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {featured.length > 0 && (
        <section aria-labelledby="featured-h" className="mb-6">
          <h2 id="featured-h" className="mb-2.5 flex items-center gap-1.5 font-display text-lg font-bold">
            <Sparkles className="size-5 text-orange-500" aria-hidden /> Featured
          </h2>
          <ul className="-mx-4 flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {featured.map((r) => (
              <li key={r.id} className="flex">
                <FeaturedResourceCard resource={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="recent-h" className="mb-6">
          <h2 id="recent-h" className="mb-2.5 font-display text-lg font-bold">
            Recently added
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {recent.map((r) => (
              <li key={r.id}>
                <ResourceCard resource={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="all-h">
        <h2 id="all-h" className="mb-2.5 font-display text-lg font-bold">
          {browsing ? "All resources" : `${list.length} ${list.length === 1 ? "result" : "results"}`}
        </h2>
        {list.length === 0 ? (
          <p className="rounded-2xl bg-ink-50 p-5 text-[0.9375rem] text-ink-700">
            {browsing ? "Resources are on their way. Check back soon." : "Nothing matches. Try another word or category."}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((r) => (
              <li key={r.id}>
                <ResourceCard resource={r} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-[0.8125rem] leading-relaxed text-ink-600">
        Perqly isn&apos;t affiliated with these providers. Offers and eligibility can change at any time, so check the provider&apos;s own
        site before you sign up. &ldquo;Needs verification&rdquo; means Perqly hasn&apos;t confirmed it works for students in Ghana.
      </p>
    </AreaShell>
  );
}
