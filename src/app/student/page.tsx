import type { Metadata } from "next";
import Link from "next/link";
import { DealCard, PopularCard } from "@/features/students/app/deal-card";
import { ArrowRight, ChevronRight, Flame, Hourglass, Lock, ScanLine, Search, Store } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { getUserContext } from "@/lib/auth/session";
import { getCategories } from "@/features/merchants/queries";
import { DEAL_SORTS, listDeals, sortDeals, type Deal, type DealSort } from "@/features/offers/queries";
import { onToday } from "@/features/offers/run-times";

/** A deal with its run-time fields filled in (missing = every day). */
const withRunTimes = (d: Deal) => ({ ...d, run_days: d.run_days ?? null, run_from: d.run_from ?? null, run_until: d.run_until ?? null });
import { getMyLiveSession } from "@/features/redemptions/queries";
import { getMyStudentStatus } from "@/features/students/queries";
import { REVIEW_PROMISE, verificationView } from "@/features/students/status";
import { CategoryTile } from "@/features/students/app/bits";
import { SortMenu } from "@/features/students/app/sort-menu";
import { getCampusEnabled } from "@/features/campus/queries";
import { CampusHomeCard } from "@/features/campus/components/campus-home-card";

export const metadata: Metadata = { title: "Deals", robots: { index: false } };

const SORTS: { value: DealSort | null; label: string; heading: string }[] = [
  { value: null, label: "Nearest", heading: "All deals" },
  { value: "top", label: "Top rated", heading: "Top rated by students" },
  { value: "new", label: "New", heading: "Newest deals" },
  { value: "hot", label: "Hot deals", heading: "Biggest savings" },
];

export default async function DealsPage({ searchParams }: PageProps<"/student">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const category = typeof params.category === "string" ? params.category : "";
  const sort = DEAL_SORTS.find((x) => x === params.sort) ?? null;
  const [ctx, status, categories, deals, live] = await Promise.all([
    getUserContext(),
    getMyStudentStatus(),
    getCategories(),
    listDeals({ query: q || undefined, category: category || undefined }).then((list) => sortDeals(list, sort)),
    getMyLiveSession(),
  ]);
  const view = verificationView(status);
  const verified = view === "verified";
  // Campus (C1): one card, only while Campus is switched on. With it off this page is unchanged.
  const campusOn = (await getCampusEnabled()).posts;
  const filtering = Boolean(q || category || sort);
  const near = filtering
    ? []
    : deals
        // Closest first; shops known to be closed right now are left out of this row.
        .filter((d) => d.distance_m !== null && d.open_now !== false)
        .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
        .slice(0, 6);
  // Like Stories: deals that only run on some days or times, and are on today. Ghana time is UTC.
  const today = filtering ? [] : onToday(deals.map(withRunTimes), new Date()).slice(0, 8);
  const campus = deals.find((d) => d.campus_name)?.campus_name ?? null;
  const chosen = categories.find((c) => c.slug === category);
  const link = (next: { q?: string; category?: string; sort?: string | null }) => {
    const sp = new URLSearchParams();
    if (next.q) sp.set("q", next.q);
    if (next.category) sp.set("category", next.category);
    if (next.sort) sp.set("sort", next.sort);
    const s = sp.toString();
    return s ? `/student?${s}` : "/student";
  };

  const hour = new Date().getUTCHours(); // Ghana is on UTC all year.
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const popular = near.slice(0, 4);
  const scanHref = verified ? "/student/scan" : view === "needs_profile" ? "/student/profile" : "/student/verify";
  return (
    <AreaShell area="student">
      <div className="-mx-4 sm:mx-0">
        <div className="px-4 sm:px-0">
          <h1 className="font-display text-[1.75rem] leading-tight font-extrabold tracking-tight dark:text-white">
            {greeting}
            {ctx?.firstName ? `, ${ctx.firstName}` : ""}
          </h1>
          <p className="mt-1 text-[0.9375rem] text-ink-600 dark:text-[#94A3B8]">Discover deals, learn and save more on campus.</p>

          <form
            role="search"
            action="/student"
            className="mt-4 flex h-[3.75rem] items-center gap-2.5 rounded-[20px] bg-white pr-1.5 pl-4 shadow-[0_2px_10px_rgba(15,23,42,0.06)] ring-1 ring-ink-200/50 focus-within:ring-2 focus-within:ring-blue-500 dark:rounded-[16px] dark:shadow-none dark:ring-[#222C3F] dark:focus-within:ring-[#2563EB]"
          >
            {category && <input type="hidden" name="category" value={category} />}
            <Search className="size-5 shrink-0 text-ink-900 dark:text-[#94A3B8]" aria-hidden />
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
              className="h-full min-w-0 flex-1 bg-transparent text-base text-ink-900 outline-none placeholder:text-ink-600 dark:placeholder:text-[#94A3B8]"
            />
            <span aria-hidden className="h-7 w-px bg-ink-200 dark:hidden" />
            <Link
              href={scanHref}
              aria-label={verified ? "Scan to redeem" : "Scan to redeem, after you're verified"}
              className={`grid size-12 shrink-0 place-items-center rounded-[15px] dark:rounded-[12px] ${verified ? "bg-blue-500 text-white dark:bg-[#2563EB]" : "bg-ink-200 text-ink-700 dark:bg-[#222C3F] dark:text-[#94A3B8]"}`}
            >
              {verified ? <ScanLine className="size-6" aria-hidden /> : <Lock className="size-5" aria-hidden />}
            </Link>
          </form>

          {live && (
            <Link
              href={`/student/redeem/${live}`}
              className="gloss-orange spring-in mt-3 flex items-center justify-between gap-3 rounded-3xl p-4 font-semibold text-ink-900"
            >
              You have a redemption in progress <ArrowRight className="size-5 shrink-0" aria-hidden />
            </Link>
          )}

          {!verified && (
            <Link
              href={view === "needs_profile" ? "/student/profile" : "/student/verify"}
              className="mt-3 flex items-center gap-3 rounded-[18px] bg-orange-50 p-3.5 ring-[1.5px] ring-orange-200"
            >
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-ink-900">
                {view === "pending" ? <Hourglass className="size-5" /> : <Lock className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink-900">
                  {view === "pending"
                    ? "Perqly is checking your details"
                    : view === "expired"
                      ? "Your verification has expired"
                      : view === "rejected"
                        ? "Your application wasn't approved"
                        : view === "resubmit"
                          ? "Your reviewer asked for a change"
                          : view === "needs_profile"
                            ? "Choose your school to start"
                            : "Verify you're a student"}
                </span>
                <span className="block text-[0.8125rem] text-ink-600">
                  {view === "pending"
                    ? `Redeeming unlocks when you're approved, usually ${REVIEW_PROMISE}.`
                    : view === "needs_profile"
                      ? "Then verify to unlock student prices."
                      : "Student ID and a selfie unlock student prices."}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-700" aria-hidden />
            </Link>
          )}

          {campusOn && (
            <div className="mt-3">
              <CampusHomeCard />
            </div>
          )}
        </div>

        <nav aria-labelledby="cat-h" className="pt-6">
          <h2 id="cat-h" className="px-4 font-display text-xl font-extrabold tracking-tight sm:px-0 dark:text-white">
            Categories
          </h2>
          <div
            data-no-swipe
            className="mt-2 flex snap-x scroll-px-4 [scrollbar-width:none] gap-2.5 overflow-x-auto px-4 pt-1.5 pb-1.5 sm:scroll-px-0 sm:px-0"
          >
            <CategoryTile href={link({ q, sort })} active={!category} icon="all" label="All" />
            {categories.map((c) => (
              <CategoryTile
                key={c.id}
                href={link({ q, category: c.slug, sort })}
                active={category === c.slug}
                icon={c.icon}
                label={c.name}
                slug={c.slug}
              />
            ))}
          </div>
        </nav>

        {!filtering && (
          <section aria-label="Campus deals" className="px-4 pt-6 sm:px-0">
            <div className="theme-fixed relative isolate h-[11.5rem] overflow-hidden rounded-[20px] bg-[linear-gradient(120deg,#1D4ED8_0%,#2563EB_100%)] text-white">
              <span
                aria-hidden
                className="absolute inset-y-0 right-0 w-48 bg-[#3B82F6]/45 [clip-path:polygon(32%_0,100%_0,100%_100%,0_100%)]"
              />
              <span aria-hidden className="absolute top-1/2 right-6 size-32 -translate-y-1/2 rounded-full bg-white/10" />
              {/* eslint-disable-next-line @next/next/no-img-element -- small local illustration */}
              <img
                src="/icons/3d/discount-ticket.webp?v=2"
                alt=""
                width={150}
                height={100}
                className="absolute top-1/2 right-3 w-[9.5rem] -translate-y-1/2 drop-shadow-[0_12px_18px_rgba(0,0,0,0.28)]"
              />
              <div className="relative max-w-[12.5rem] p-5">
                <p className="font-display text-[1.75rem] leading-none font-extrabold tracking-tight">Campus</p>
                <p className="font-display text-[1.75rem] leading-none font-extrabold tracking-tight text-[#FDBA8C]">Deals</p>
                <p className="mt-2 text-sm text-white/90">Student-only offers near {campus ?? "your campus"}</p>
                <a
                  href="#all-h"
                  className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-[0.9375rem] font-bold text-[#0B111E]"
                >
                  Explore deals <ArrowRight className="size-4" aria-hidden />
                </a>
              </div>
            </div>
          </section>
        )}

        {popular.length > 0 && (
          <section aria-labelledby="near-h" className="pt-6">
            <div className="flex items-center justify-between px-4 sm:px-0">
              <h2 id="near-h" className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight dark:text-white">
                <Flame className="size-5 fill-orange-500 text-orange-600" aria-hidden />
                Popular near you
              </h2>
              <Link href="/student/map" className="inline-flex min-h-11 items-center gap-1 text-[0.9375rem] font-bold text-blue-700">
                See all <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-3 px-4 sm:px-0 lg:grid-cols-4 [&>li]:min-w-0">
              {popular.map((d) => (
                <li key={d.offer_id}>
                  <PopularCard deal={d} back={link({ q, category })} locked={!verified} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {today.length > 0 && (
          <section aria-labelledby="today-h">
            <div className="flex items-baseline justify-between px-4 pt-6 pb-2 sm:px-0">
              <h2 id="today-h" className="font-display text-xl font-extrabold tracking-tight">
                On today
              </h2>
              <span className="text-[0.8125rem] font-medium text-ink-600">Set days and times</span>
            </div>
            <ul data-no-swipe className="flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 sm:px-0">
              {today.map((d) => (
                <li key={d.offer_id} className="w-60 shrink-0 snap-start">
                  <DealCard deal={d} back={link({ q, category })} locked={!verified} compact />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="all-h">
          <div className="flex items-baseline justify-between px-4 pt-5 pb-2 sm:px-0">
            <h2 id="all-h" className="scroll-mt-24 font-display text-xl font-extrabold tracking-tight">
              {q ? `Results for “${q}”` : chosen ? chosen.name : sort ? SORTS.find((o) => o.value === sort)?.heading : "All deals"}
            </h2>
            <SortMenu
              current={sort}
              options={SORTS.map((o) => ({ label: o.label, href: link({ q, category, sort: o.value }), value: o.value }))}
            />
          </div>
          <p className="-mt-1 px-4 pb-2 text-[0.8125rem] font-medium text-ink-600 sm:px-0">
            {deals.length} {deals.length === 1 ? "deal" : "deals"}
          </p>
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
            <ul className="grid grid-cols-1 gap-3 px-4 pb-6 sm:grid-cols-2 sm:gap-4 sm:px-0 xl:grid-cols-3 [&>li]:min-w-0">
              {deals.map((d) => (
                <li key={d.offer_id}>
                  <DealCard deal={d} back={link({ q, category, sort })} locked={!verified} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AreaShell>
  );
}
