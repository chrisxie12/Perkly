import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { getActiveMembership } from "@/features/merchants/queries";
import { ActionForm } from "@/features/campus/components/action-form";
import { deleteClosedDay, deleteHours, setServiceBookable } from "@/features/bookings/actions";
import { ClosedDayForm, HoursForm } from "@/features/bookings/components/setup-forms";
import { getBookingSetup } from "@/features/bookings/queries";
import { WEEKDAYS, dayLabel } from "@/features/bookings/schemas";
import { canManage } from "../../merchant-nav";

export const metadata: Metadata = { title: "Booking hours", robots: { index: false } };

export default async function BookingSetupPage() {
  const membership = await getActiveMembership();
  if (!membership || !canManage(membership)) redirect("/merchant/bookings");
  const setup = await getBookingSetup(membership.merchantId);
  if (!setup) redirect("/merchant/bookings");
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? "";
  const bookable = setup.services.filter((s) => s.is_bookable);
  const card = "rounded-2xl bg-white p-5 ring-1 ring-ink-200";
  return (
    <AreaShell area="merchant">
      <Link href="/merchant/bookings" className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
        <ChevronLeft className="size-5" aria-hidden /> Bookings
      </Link>
      <PageTitle title="Booking hours" description="Choose which services students can book, and when. Times are Ghana time." />
      <div className="grid max-w-3xl gap-8">
        <section aria-labelledby="services" className="space-y-3">
          <h2 id="services" className="font-display text-lg font-bold">
            Bookable services
          </h2>
          {setup.services.length === 0 ? (
            <p className="text-ink-700">
              Add services in your{" "}
              <Link href="/merchant/catalogue" className="font-semibold text-blue-600">
                catalogue
              </Link>{" "}
              first. Products can&apos;t be booked.
            </p>
          ) : (
            <ul className="space-y-2">
              {setup.services.map((s) => (
                <li key={s.id} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
                  <span>
                    <span className="font-semibold text-ink-900">{s.name}</span>{" "}
                    <span className="text-ink-600">{s.is_bookable ? "· Bookable" : "· Walk-in only"}</span>
                  </span>
                  <ActionForm
                    action={setServiceBookable}
                    fields={{ serviceId: s.id, on: s.is_bookable ? "0" : "1" }}
                    label={s.is_bookable ? "Make walk-in only" : "Make bookable"}
                    variant={s.is_bookable ? "ghost" : "secondary"}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {bookable.length > 0 && (
          <section aria-labelledby="hours" className="space-y-3">
            <h2 id="hours" className="font-display text-lg font-bold">
              Weekly hours
            </h2>
            {setup.rules.length === 0 ? (
              <p className="text-ink-700">No hours yet, so students can&apos;t book. Add some below.</p>
            ) : (
              <ul className="space-y-2">
                {setup.rules.map((r) => (
                  <li key={r.id} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
                    <span>
                      <span className="font-semibold text-ink-900">
                        {WEEKDAYS[r.weekday]} {r.start_time}–{r.end_time}
                      </span>{" "}
                      <span className="text-ink-700">
                        {name(setup.services, r.service_id)} at {name(setup.branches, r.branch_id)}, {r.slot_minutes}-minute slots,{" "}
                        {r.capacity === 1 ? "1 student" : `${r.capacity} students`} each
                      </span>
                    </span>
                    <ActionForm action={deleteHours} fields={{ ruleId: r.id }} label="Remove" variant="ghost" />
                  </li>
                ))}
              </ul>
            )}
            <div className={card}>
              <h3 className="mb-4 font-semibold text-ink-900">Add hours</h3>
              <HoursForm branches={setup.branches} services={bookable} />
            </div>
          </section>
        )}

        {bookable.length > 0 && (
          <section aria-labelledby="closed" className="space-y-3">
            <h2 id="closed" className="font-display text-lg font-bold">
              Closed days
            </h2>
            {setup.exceptions.length > 0 && (
              <ul className="space-y-2">
                {setup.exceptions.map((e) => (
                  <li key={e.id} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
                    <span>
                      <span className="font-semibold text-ink-900">{dayLabel(e.date)}</span>{" "}
                      <span className="text-ink-700">
                        {e.is_closed ? "closed" : `open ${e.start_time}–${e.end_time}`} at {name(setup.branches, e.branch_id)}
                        {e.service_id ? ` for ${name(setup.services, e.service_id)}` : ""}
                        {e.reason ? `: ${e.reason}` : ""}
                      </span>
                    </span>
                    <ActionForm action={deleteClosedDay} fields={{ exceptionId: e.id }} label="Remove" variant="ghost" />
                  </li>
                ))}
              </ul>
            )}
            <div className={card}>
              <h3 className="mb-4 font-semibold text-ink-900">Close a day</h3>
              <ClosedDayForm branches={setup.branches} services={bookable} />
            </div>
          </section>
        )}
      </div>
    </AreaShell>
  );
}
