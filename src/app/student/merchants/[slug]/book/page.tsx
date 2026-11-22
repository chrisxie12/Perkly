import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarX, ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMerchantPage, listDeals } from "@/features/offers/queries";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { RequestForm } from "@/features/bookings/components/request-form";
import { getBookableServices, getSlots } from "@/features/bookings/queries";
import { getFeatureSwitches } from "@/features/platform/switches";
import { dayLabel, nextDays } from "@/features/bookings/schemas";

export const metadata: Metadata = { title: "Book", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_AHEAD = 14;

function Choice({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex min-h-12 items-center rounded-xl px-4 font-semibold ring-1",
        selected ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-ink-900 ring-ink-200 hover:bg-ink-50",
      )}
    >
      {children}
    </Link>
  );
}

export default async function BookPage({ params, searchParams }: PageProps<"/student/merchants/[slug]/book">) {
  const { slug } = await params;
  const sp = await searchParams;
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) notFound();
  const [shop, status, switches] = await Promise.all([getMerchantPage(slug), getMyStudentStatus(), getFeatureSwitches()]);
  if (!shop || !switches.bookings) notFound();
  const base = `/student/merchants/${slug}/book`;
  const back = (
    <Link href={`/student/merchants/${slug}`} className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
      <ChevronLeft className="size-5" aria-hidden /> {shop.display_name}
    </Link>
  );

  if (verificationView(status) !== "verified") {
    return (
      <AreaShell area="student">
        {back}
        <PageTitle title="Book an appointment" />
        <EmptyState
          icon={<CalendarX aria-hidden />}
          title="Verify to book"
          description="Bookings are for verified students."
          action={
            <Link href="/student/verify" className={buttonVariants()}>
              Verify your student status
            </Link>
          }
        />
      </AreaShell>
    );
  }

  const services = await getBookableServices(shop.id);
  const service = services.find((s) => s.id === sp.service) ?? (services.length === 1 ? services[0] : undefined);
  const branch = service?.branches.find((b) => b.id === sp.branch) ?? (service?.branches.length === 1 ? service.branches[0] : undefined);
  const days = nextDays(new Date(), DAYS_AHEAD);
  const day = typeof sp.day === "string" && DAY.test(sp.day) && days.includes(sp.day) ? sp.day : undefined;
  const link = (q: Record<string, string | undefined>) =>
    `${base}?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][])}`;

  const [slots, deals] =
    service && branch && day && UUID.test(service.id)
      ? await Promise.all([getSlots(branch.id, service.id, day), listDeals({ merchantId: shop.id })])
      : [[], []];
  const serviceDeals = deals
    .filter((d) => d.item_name === service?.name && (d.branch_id === null || d.branch_id === branch?.id))
    .map((d) => ({ id: d.offer_id, label: d.title }));

  return (
    <AreaShell area="student">
      {back}
      <PageTitle title="Book an appointment" description="Times are Ghana time." />
      {services.length === 0 ? (
        <EmptyState icon={<CalendarX aria-hidden />} title="No online bookings here" description="This shop is walk-in only for now." />
      ) : (
        <div className="grid max-w-2xl gap-8">
          <section aria-labelledby="pick-service">
            <h2 id="pick-service" className="mb-3 font-display text-lg font-bold">
              Service
            </h2>
            <div className="grid gap-2">
              {services.map((s) => (
                <Choice key={s.id} href={link({ service: s.id })} selected={s.id === service?.id}>
                  <span className="flex-1">{s.name}</span>
                  {s.duration_minutes && <span className="font-normal">{s.duration_minutes} min</span>}
                </Choice>
              ))}
            </div>
          </section>
          {service && (
            <section aria-labelledby="pick-branch">
              <h2 id="pick-branch" className="mb-3 font-display text-lg font-bold">
                Branch
              </h2>
              <div className="grid gap-2">
                {service.branches.map((b) => (
                  <Choice key={b.id} href={link({ service: service.id, branch: b.id })} selected={b.id === branch?.id}>
                    {b.name}
                    {b.area ? `, ${b.area}` : ""}
                  </Choice>
                ))}
              </div>
            </section>
          )}
          {service && branch && (
            <section aria-labelledby="pick-day">
              <h2 id="pick-day" className="mb-3 font-display text-lg font-bold">
                Day
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {days.map((d) => (
                  <Choice key={d} href={link({ service: service.id, branch: branch.id, day: d })} selected={d === day}>
                    <span className="whitespace-nowrap">{dayLabel(d)}</span>
                  </Choice>
                ))}
              </div>
            </section>
          )}
          {service && branch && day && (
            <section aria-labelledby="pick-time">
              <h2 id="pick-time" className="sr-only">
                Time
              </h2>
              {slots.length === 0 ? (
                <p className="text-ink-700">No free times on {dayLabel(day)}. Try another day.</p>
              ) : (
                <RequestForm
                  branchId={branch.id}
                  serviceId={service.id}
                  slots={slots}
                  deals={serviceDeals}
                  requestId={crypto.randomUUID()}
                />
              )}
            </section>
          )}
        </div>
      )}
    </AreaShell>
  );
}
