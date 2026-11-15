import { PageContainer } from "@/components/layout/page-container";

/**
 * True-by-design facts, set as a receipt. Pre-launch there are no user or
 * savings numbers to show, so nothing here is a traction metric.
 */
const lines = [
  { label: "What students pay", value: "GH₵0" },
  { label: "Campuses at launch", value: "1, GCTU" },
  { label: "How long a live pass lasts", value: "10 min" },
  { label: "App stores you need to visit", value: "0" },
];

export function ReceiptFacts() {
  return (
    <section aria-labelledby="facts-title" className="py-24 md:py-32">
      <PageContainer className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div>
          <h2 id="facts-title" className="font-display text-display-lg font-extrabold">
            The fine print, in big print.
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-600">
            We&apos;re just getting started, so we won&apos;t show you made-up numbers. Here&apos;s what&apos;s true today.
          </p>
        </div>

        <div className="mx-auto w-full max-w-lg">
          <div className="relative bg-white px-7 pt-8 pb-12 shadow-lift [clip-path:polygon(0_0,100%_0,100%_calc(100%-14px),95%_100%,90%_calc(100%-14px),85%_100%,80%_calc(100%-14px),75%_100%,70%_calc(100%-14px),65%_100%,60%_calc(100%-14px),55%_100%,50%_calc(100%-14px),45%_100%,40%_calc(100%-14px),35%_100%,30%_calc(100%-14px),25%_100%,20%_calc(100%-14px),15%_100%,10%_calc(100%-14px),5%_100%,0_calc(100%-14px))] sm:px-10">
            <div className="flex items-baseline justify-between border-b-2 border-dashed border-ink-300 pb-5">
              <p className="font-display text-2xl font-extrabold tracking-tight">perqly</p>
              <p className="text-sm font-medium text-ink-600">Receipt</p>
            </div>
            <dl className="divide-y divide-dashed divide-ink-200">
              {lines.map((line) => (
                <div key={line.label} className="flex items-baseline gap-3 py-4">
                  <dt className="text-ink-700">{line.label}</dt>
                  <span aria-hidden className="min-w-6 flex-1 translate-y-[-4px] border-b-2 border-dotted border-ink-300" />
                  <dd className="font-display text-xl font-extrabold whitespace-nowrap tabular-nums">{line.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink-900 pt-5">
              <p className="font-display text-lg font-bold">Total</p>
              <p className="font-display text-xl font-extrabold text-blue-600">Real campus value</p>
            </div>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
