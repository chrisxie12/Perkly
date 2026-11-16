import type { Metadata } from "next";
import Link from "next/link";
import { DealCard } from "@/features/students/app/deal-card";
import { ArrowRight, Search, Store } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { getUserContext } from "@/lib/auth/session";
import { getCategories } from "@/features/merchants/queries";
import { money } from "@/features/offers/schemas";
import { listDeals } from "@/features/offers/queries";
import { getMyLiveSession, getSavingsSummary } from "@/features/redemptions/queries";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { CategoryChip } from "@/features/students/app/bits";

export const metadata: Metadata = { title: "Deals", robots: { index: false } };

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Accra" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function DealsPage({ searchParams }: PageProps<"/student">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const category = typeof params.category === "string" ? params.category : "";
  const [ctx, status, categories, deals, live, savings] = await Promise.all([
    getUserContext(),
    getMyStudentStatus(),
    getCategories(),
    listDeals({ query: q || undefined, category: category || undefined }),
    getMyLiveSession(),
    getSavingsSummary(),
  ]);
  const view = verificationView(status);
  const verified = view === "verified";
  const filtering = Boolean(q || category);
  const near = filtering
    ? []
    : deals
        // Closest first; shops known to be closed right now are left out of this row.
        .filter((d) => d.distance_m !== null && d.open_now !== false)
        .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
        .slice(0, 6);
  const anyHours = near.some((d) => d.has_hours);
  const campus = deals.find((d) => d.campus_name)?.campus_name ?? null;
  const chosen = categories.find((c) => c.slug === category);
  const link = (next: { q?: string; category?: string }) => {
    const sp = new URLSearchParams();
    if (next.q) sp.set("q", next.q);
    if (next.category) sp.set("category", next.category);
    const s = sp.toString();
    return s ? `/student?${s}` : "/student";
  };

  return (
    <AreaShell area="student">
      <div className="-mx-4 sm:mx-0">
        <div className="px-4 sm:px-0">
          <p className="text-[0.9375rem] text-ink-600">{greeting(new Date())}</p>
          <h1 className="font-display text-3xl leading-tight font-bold tracking-tight">{ctx?.firstName ?? ctx?.fullName ?? "Welcome"}</h1>
        </div>

        <div className="mt-4 space-y-3 px-4 sm:px-0">
          {live && (
            <Link
              href={`/student/redeem/${live}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-ink-900 p-4 font-semibold text-white"
            >
              You have a redemption in progress <ArrowRight className="size-5 shrink-0" aria-hidden />
            </Link>
          )}
          {verified ? (
            <Link
              href="/student/history"
              className="relative flex items-center gap-4 overflow-hidden rounded-2xl bg-blue-500 p-4 pl-5 text-white"
              aria-label="See your savings"
            >
              <span
                className="pointer-events-none absolute -top-10 -right-8 size-36 rounded-full border-[22px] border-white/10"
                aria-hidden
              />
              <span>
                <span className="block text-[0.8125rem] font-medium opacity-85">Saved with Perqly</span>
                <span className="block font-display text-3xl leading-tight font-bold tracking-tight tabular-nums">
                  {money(savings.total_saved)}
                </span>
                <span className="block text-[0.8125rem] opacity-85">
                  {savings.redemptions === 0
                    ? "Your first discount shows up here"
                    : `${savings.redemptions} ${savings.redemptions === 1 ? "visit" : "visits"}, ${savings.shops} ${savings.shops === 1 ? "shop" : "shops"}`}
                </span>
              </span>
              <span className="relative ml-auto grid size-9 place-items-center rounded-full bg-white/15">
                <ArrowRight className="size-5" aria-hidden />
              </span>
            </Link>
          ) : view === "pending" ? (
            <div className="rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-200">
              <h2 className="font-display text-lg font-bold">Perqly is checking your details</h2>
              <p className="mt-1 text-sm text-ink-700">You can browse deals now. Redeeming unlocks when they approve you.</p>
              <Link href="/student/verify" className={`${buttonVariants({ size: "sm", variant: "secondary" })} mt-3`}>
                See status
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl bg-ink-900 p-4 text-white">
              <h2 className="font-display text-lg leading-snug font-bold">
                {view === "expired" ? "Your verification has expired" : "Get verified to unlock student prices"}
              </h2>
              <p className="mt-1 text-sm text-white/75">
                {view === "needs_profile"
                  ? "Start by choosing your school."
                  : view === "resubmit"
                    ? "Your reviewer asked you to change something."
                    : "You'll need your student ID card."}
              </p>
              <Link
                href={view === "needs_profile" ? "/student/profile" : "/student/verify"}
                className={`${buttonVariants({ size: "sm" })} mt-3`}
              >
                {view === "needs_profile" ? "Choose your school" : view === "resubmit" ? "See what to change" : "Start verification"}{" "}
                <ArrowRight aria-hidden />
              </Link>
            </div>
          )}
        </div>

        <form
          role="search"
          action="/student"
          className="mx-4 mt-4 flex h-12 items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-ink-200 focus-within:ring-2 focus-within:ring-blue-500 sm:mx-0"
        >
          {category && <input type="hidden" name="category" value={category} />}
          <Search className="size-5 text-ink-600" aria-hidden />
          <label htmlFor="q" className="sr-only">
            Search deals or shops
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search deals or shops"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-600"
          />
        </form>

        <nav
          aria-label="Categories"
          className="sticky top-16 z-10 flex [scrollbar-width:none] gap-2 overflow-x-auto bg-paper px-4 pt-3 pb-2 sm:px-0"
        >
          <CategoryChip href={link({ q })} active={!category} label="All" />
          {categories.map((c) => (
            <CategoryChip key={c.id} href={link({ q, category: c.slug })} active={category === c.slug} icon={c.icon} label={c.name} />
          ))}
        </nav>

        {near.length > 0 && (
          <section aria-labelledby="near-h">
            <div className="flex items-baseline justify-between px-4 pt-4 pb-2 sm:px-0">
              <h2 id="near-h" className="font-display text-lg font-bold">
                {anyHours ? "Open now near" : "Closest to"} {campus ?? "campus"}
              </h2>
              <span className="text-[0.8125rem] font-medium text-ink-600">By walking time</span>
            </div>
            <ul className="flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 sm:px-0">
              {near.map((d) => (
                <li key={d.offer_id} className="w-64 shrink-0 snap-start">
                  <DealCard deal={d} back={link({ q, category })} locked={!verified} compact />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="all-h">
          <div className="flex items-baseline justify-between px-4 pt-5 pb-2 sm:px-0">
            <h2 id="all-h" className="font-display text-lg font-bold">
              {q ? `Results for “${q}”` : chosen ? chosen.name : "All deals"}
            </h2>
            <span className="text-[0.8125rem] font-medium text-ink-600">
              {deals.length} {deals.length === 1 ? "deal" : "deals"}
            </span>
          </div>
          {deals.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <span className="mb-2 grid size-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <Store className="size-7" aria-hidden />
              </span>
              <h3 className="font-display text-xl font-bold">Nothing here yet</h3>
              <p className="mt-1 max-w-[30ch] text-[0.9375rem] text-ink-600">
                {q
                  ? `No deals match “${q}”. Try a shop name or what you're buying.`
                  : "Businesses near campus are joining Perqly. Their deals will appear here."}
              </p>
              {filtering && (
                <Link href="/student" className={`${buttonVariants({ size: "sm", variant: "secondary" })} mt-4`}>
                  Show all deals
                </Link>
              )}
            </div>
          ) : (
            <ul className="grid gap-4 px-4 pb-6 sm:grid-cols-2 sm:px-0">
              {deals.map((d) => (
                <li key={d.offer_id}>
                  <DealCard deal={d} back={link({ q, category })} locked={!verified} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AreaShell>
  );
}
