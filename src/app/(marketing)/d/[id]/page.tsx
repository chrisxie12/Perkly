import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getDealPreview } from "@/features/offers/queries";
import { discountLabel, money } from "@/features/offers/schemas";
import { formatRunTimes, isEveryDay } from "@/features/offers/run-times";
import { initials } from "@/features/students/app/format";

export async function generateMetadata({ params }: PageProps<"/d/[id]">): Promise<Metadata> {
  const { id } = await params;
  const deal = await getDealPreview(id);
  if (!deal) return { title: "Student deal", robots: { index: false } };
  const label = discountLabel(deal.discount_type, deal.discount_value);
  return {
    title: `${deal.item} at ${deal.merchant_name}: ${label}`,
    description: `${label} for verified students with Perqly. Scan at the counter, show your live pass, pay the student price.`,
    robots: { index: false },
  };
}

/** What a shared deal link opens: the deal, and a way into the app. Public, so link previews work. */
export default async function SharedDealPage({ params }: PageProps<"/d/[id]">) {
  const { id } = await params;
  const deal = await getDealPreview(id);

  if (!deal) {
    return (
      <section className="mx-auto max-w-md px-5 py-20 text-center">
        <h1 className="font-display text-3xl font-black tracking-tight">This deal isn&apos;t running any more</h1>
        <p className="mt-3 text-ink-600">It may have ended or been paused. There are other student deals near campus.</p>
        <Link href="/student" className={buttonVariants({ className: "mt-6" })}>
          See student deals
        </Link>
      </section>
    );
  }

  const saving = deal.discount_amount > 0;
  return (
    <section className="mx-auto max-w-md px-5 pt-10 pb-28 sm:pt-16">
      <article className="overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_-24px_rgba(0,31,82,0.35)] ring-1 ring-ink-200/70">
        <div className="relative h-56 bg-blue-50">
          {deal.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- public storage URL
            <img src={deal.cover_url} alt="" className="size-full object-cover" />
          ) : (
            <span aria-hidden className="grid size-full place-items-center font-display text-6xl font-black text-blue-700">
              {initials(deal.merchant_name)}
            </span>
          )}
        </div>
        <div className="p-5">
          {deal.category && <p className="text-[0.8125rem] font-medium text-ink-600">{deal.category}</p>}
          <h1 className="mt-1 font-display text-[1.75rem] leading-tight font-black tracking-tight text-ink-900">{deal.merchant_name}</h1>
          <p className="mt-1 text-lg text-ink-700">{deal.item}</p>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-3xl font-black text-ink-900">{money(deal.final_price)}</span>
            {saving && <span className="text-lg text-ink-600 line-through">{money(deal.regular_price)}</span>}
            <span className="ml-auto rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
              {discountLabel(deal.discount_type, deal.discount_value)}
            </span>
          </p>
          {!isEveryDay(deal) && (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-ink-700">
              <Clock className="size-4" aria-hidden /> Runs {formatRunTimes(deal)}
            </p>
          )}
          <Link href={`/student/offers/${deal.offer_id}`} className={buttonVariants({ size: "lg", className: "mt-5 w-full" })}>
            Get this deal on Perqly
          </Link>
          <p className="mt-4 flex gap-2 text-sm text-ink-600">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden />
            For verified students. Sign in or join with your student details, then scan at the counter and pay the student price.
          </p>
        </div>
      </article>
    </section>
  );
}
