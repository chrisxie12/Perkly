import type { Metadata } from "next";
import Link from "next/link";
import { DealCard } from "@/features/students/app/deal-card";
import { ArrowRight, Flame, LayoutGrid, Map as MapIcon, Search, Store } from "lucide-react";
import { AreaShell } from "@/components/layout/area-shell";
import { buttonVariants } from "@/components/ui/button";
import { getUserContext } from "@/lib/auth/session";
import { getCategories } from "@/features/merchants/queries";
import { money } from "@/features/offers/schemas";
import { DEAL_SORTS, listDeals, sortDeals, type DealSort } from "@/features/offers/queries";
import { cn } from "@/lib/utils";
import { getMyLiveSession, getSavingsSummary } from "@/features/redemptions/queries";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { CategoryChip } from "@/features/students/app/bits";
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
  const [ctx, status, categories, deals, live, savings] = await Promise.all([
    getUserContext(),
    getMyStudentStatus(),
    getCategories(),
    listDeals({ query: q || undefined, category: category || undefined }).then((list) => sortDeals(list, sort)),
    getMyLiveSession(),
    getSavingsSummary(),
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
  const anyHours = near.some((d) => d.has_hours);
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

  return (
    <AreaShell area="student">
      <div className="-mx-4 sm:mx-0">
        {/* Hero: deep blue with soft moving light; the glass panels float on top of it. */}
        <section
          aria-labelledby="deals-h"
          className="theme-fixed relative isolate -mt-6 overflow-hidden rounded-b-[2rem] bg-[#0e1626] px-4 pt-6 pb-5 text-white sm:mt-0 sm:rounded-[2rem] sm:px-6"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-24 -left-20 -z-10 size-80 animate-drift rounded-full bg-[radial-gradient(circle,#3d8bff_0%,rgba(0,102,255,0)_70%)] opacity-80 blur-2xl"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-16 -right-24 -z-10 size-72 animate-drift rounded-full bg-[radial-gradient(circle,#ff6b35_0%,rgba(255,107,53,0)_70%)] opacity-60 blur-2xl [animation-delay:-6s]"
          />
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-medium text-white/80">
                {ctx?.firstName ? `${ctx.firstName}, here's` : "Here's"} what&apos;s on near {campus ?? "your campus"}
              </p>
              <h1 id="deals-h" className="mt-0.5 font-display text-4xl leading-none font-extrabold tracking-tight">
                Campus deals
              </h1>
            </div>
            <div className="glass-dark flex shrink-0 items-center gap-1 rounded-full p-1" role="group" aria-label="View">
              <span
                aria-current="page"
                className="flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-semibold text-ink-900"
              >
                <LayoutGrid className="size-4" aria-hidden /> Grid
              </span>
              <Link
                href="/student/map"
                className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                <MapIcon className="size-4" aria-hidden /> Map
              </Link>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {live && (
              <Link
                href={`/student/redeem/${live}`}
                className="gloss-orange spring-in flex items-center justify-between gap-3 rounded-3xl p-4 font-semibold text-ink-900"
              >
                You have a redemption in progress <ArrowRight className="size-5 shrink-0" aria-hidden />
              </Link>
            )}
            {campusOn && <CampusHomeCard />}
            {verified ? (
              <Link
                href="/student/history"
                className="gloss-blue spring-in relative flex items-center gap-4 overflow-hidden rounded-3xl p-5"
                aria-label="See your savings"
              >
                <span className="glass-sheen" aria-hidden />
                <span className="relative">
                  <span className="block text-[0.8125rem] font-medium text-white/85">Saved with Perqly</span>
                  <span className="block font-display text-4xl leading-tight font-extrabold tracking-tight tabular-nums">
                    {money(savings.total_saved)}
                  </span>
                  <span className="block text-[0.8125rem] text-white/85">
                    {savings.redemptions === 0
                      ? "Your first discount shows up here"
                      : `${savings.redemptions} ${savings.redemptions === 1 ? "visit" : "visits"}, ${savings.shops} ${savings.shops === 1 ? "shop" : "shops"}`}
                  </span>
                </span>
                <span className="relative ml-auto grid size-10 place-items-center rounded-full bg-white/20">
                  <ArrowRight className="size-5" aria-hidden />
                </span>
              </Link>
            ) : view === "pending" ? (
              <div className="glass-dark spring-in rounded-3xl p-4">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                  <span className="relative flex size-2.5" aria-hidden>
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-orange-500" />
                  </span>
                  Perqly is checking your details
                </h2>
                <p className="mt-1 text-sm text-white/80">You can browse deals now. Redeeming unlocks when they approve you.</p>
                <Link
                  href="/student/verify"
                  className="mt-3 inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-ink-900"
                >
                  See status
                </Link>
              </div>
            ) : (
              <div className="glass-dark spring-in rounded-3xl p-4">
                <h2 className="font-display text-lg leading-snug font-bold">
                  {view === "expired" ? "Your verification has expired" : "Get verified to unlock student prices"}
                </h2>
                <p className="mt-1 text-sm text-white/80">
                  {view === "needs_profile"
                    ? "Start by choosing your school."
                    : view === "resubmit"
                      ? "Your reviewer asked you to change something."
                      : "You'll need your student ID card."}
                </p>
                <Link
                  href={view === "needs_profile" ? "/student/profile" : "/student/verify"}
                  className="gloss-orange mt-3 inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-ink-900"
                >
                  {view === "needs_profile" ? "Choose your school" : view === "resubmit" ? "See what to change" : "Start verification"}{" "}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            )}
          </div>

          <form
            role="search"
            action="/student"
            className="glass-dark mt-4 flex h-12 items-center gap-2 rounded-full px-4 focus-within:ring-2 focus-within:ring-white/70"
          >
            {category && <input type="hidden" name="category" value={category} />}
            <Search className="size-5 text-white/80" aria-hidden />
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
              className="h-full min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/70"
            />
          </form>
        </section>

        <nav aria-label="Sort deals" className="flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pt-4 sm:px-0">
          {SORTS.map((o) => {
            const active = (o.value ?? null) === sort;
            return (
              <Link
                key={o.label}
                href={link({ q, category, sort: o.value })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[0.8125rem] font-semibold ring-1 transition-all duration-300 active:scale-95",
                  active
                    ? "bg-ink-900 text-white ring-ink-900"
                    : "bg-white text-ink-700 ring-ink-200 hover:text-blue-500 hover:ring-blue-300",
                )}
              >
                {o.value === "hot" && <Flame className={cn("size-3.5", active ? "text-white" : "text-orange-500")} aria-hidden />}
                {o.label}
              </Link>
            );
          })}
        </nav>

        <nav
          aria-label="Categories"
          className="sticky top-16 z-10 flex [scrollbar-width:none] gap-2 overflow-x-auto bg-paper px-4 pt-3 pb-2 sm:px-0"
        >
          <CategoryChip href={link({ q, sort })} active={!category} label="All" />
          {categories.map((c) => (
            <CategoryChip key={c.id} href={link({ q, category: c.slug, sort })} active={category === c.slug} icon={c.icon} label={c.name} />
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
                <li key={d.offer_id} className="w-60 shrink-0 snap-start">
                  <DealCard deal={d} back={link({ q, category })} locked={!verified} compact />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="all-h">
          <div className="flex items-baseline justify-between px-4 pt-5 pb-2 sm:px-0">
            <h2 id="all-h" className="font-display text-lg font-bold">
              {q ? `Results for “${q}”` : chosen ? chosen.name : sort ? SORTS.find((o) => o.value === sort)?.heading : "All deals"}
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
            <ul className="grid grid-cols-1 gap-5 px-4 pb-6 sm:grid-cols-2 sm:px-0 xl:grid-cols-3 [&>li]:min-w-0">
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
