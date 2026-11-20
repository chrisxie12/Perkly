import Link from "next/link";
import { Laptop, Lock, Printer, Scissors, Shirt, Utensils, CupSoda, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageContainer, SectionHeading } from "@/components/layout/page-container";

/** Invented example merchants. Not real businesses, and labelled as examples. */
const offers: { merchant: string; deal: string; detail: string; category: string; icon: LucideIcon; band: string }[] = [
  {
    merchant: "Auntie Esi's Waakye",
    deal: "15% off any plate",
    detail: "Weekdays, 11am to 3pm",
    category: "Food & drinks",
    icon: Utensils,
    band: "bg-orange-500 text-ink-900",
  },
  {
    merchant: "Paperclip Print Corner",
    deal: "GH₵1 off every 10 pages",
    detail: "Printing, binding, photocopies",
    category: "Printing",
    icon: Printer,
    band: "bg-blue-500 text-white",
  },
  {
    merchant: "Fresh Fade Barbering",
    deal: "GH₵10 off your first cut",
    detail: "Once per student",
    category: "Barbers & salons",
    icon: Scissors,
    band: "bg-ink-900 text-white",
  },
  {
    merchant: "ByteFix Phone Repairs",
    deal: "20% off screen protectors",
    detail: "All phone models",
    category: "Tech & repairs",
    icon: Laptop,
    band: "bg-blue-700 text-white",
  },
  {
    merchant: "Sip Spot Juice Bar",
    deal: "Second smoothie half price",
    detail: "Any size, any day",
    category: "Food & drinks",
    icon: CupSoda,
    band: "bg-[#F5B800] text-ink-900",
  },
  {
    merchant: "Campus Threads",
    deal: "10% off everything",
    detail: "In store only",
    category: "Fashion",
    icon: Shirt,
    band: "bg-[#15803D] text-white",
  },
];

export function ExampleOffers() {
  return (
    <section aria-labelledby="offers-title" className="py-14 sm:py-20 md:py-32">
      <PageContainer>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            id="offers-title"
            title="The kind of deals on Perqly."
            intro="These are examples to show how Perqly works. Open the app to see the real offers near your campus."
          />
          <Badge variant="outline" className="self-start md:self-auto">
            Example offers, not real businesses
          </Badge>
        </div>

        <ul className="-mx-5 mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:mt-14 sm:px-8 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3">
          {offers.map(({ merchant, deal, detail, category, icon: Icon, band }) => (
            <li key={merchant} className="reveal w-[82%] shrink-0 snap-start sm:w-[60%] md:w-auto">
              <Link
                href="/student"
                aria-label={`${deal} at ${merchant}. Example offer. Deals unlock once you are verified as a student.`}
                className="ticket group block w-full overflow-hidden rounded-xl bg-ink-100 text-left transition-transform duration-300 hover:-translate-y-1 focus-visible:-translate-y-1"
              >
                <div className={`flex items-center justify-between px-5 py-4 md:px-6 ${band}`}>
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="size-4" aria-hidden /> {category}
                  </span>
                  <span className="rounded-full bg-white/90 px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-700">Example</span>
                </div>
                <div className="px-5 pt-5 pb-3 md:px-6">
                  <p className="font-display text-2xl leading-tight font-extrabold tracking-tight">{deal}</p>
                  <p className="mt-2 font-semibold text-ink-700">{merchant}</p>
                </div>
                <div className="mx-5 border-t-2 border-dashed border-ink-300 md:mx-6" />
                <div className="flex items-center justify-between px-5 pt-3 pb-5 text-sm text-ink-600 md:px-6">
                  <span>{detail}</span>
                  <Lock className="size-4 text-ink-500 transition-colors group-hover:text-blue-600" aria-hidden />
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-[52ch] text-sm leading-relaxed text-ink-600">
          The businesses and discounts above are invented to illustrate Perqly. They are not Perqly partners, and no partnership or offer
          with them exists.
        </p>
      </PageContainer>
    </section>
  );
}
