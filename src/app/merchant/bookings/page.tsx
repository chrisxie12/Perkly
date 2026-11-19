import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { cn } from "@/lib/utils";
import { getActiveMembership } from "@/features/merchants/queries";
import { MerchantBookingCard } from "@/features/bookings/components/booking-cards";
import { getMerchantBookings, getSlots } from "@/features/bookings/queries";
import type { Slot } from "@/features/bookings/schemas";
import { canManage } from "../merchant-nav";

export const metadata: Metadata = { title: "Bookings", robots: { index: false } };

export default async function MerchantBookingsPage({ searchParams }: PageProps<"/merchant/bookings">) {
  const membership = await getActiveMembership();
  if (!membership) redirect("/merchant");
  const view = (await searchParams).view === "past" ? "past" : "upcoming";
  const bookings = await getMerchantBookings(membership.merchantId, view);
  // Free times on each pending request's day, so the shop can propose one.
  const pending = bookings.filter((b) => b.status === "pending");
  const slotLists = await Promise.all(pending.map((b) => getSlots(b.branch.id, b.service.id, b.starts_at.slice(0, 10))));
  const slotsFor = new Map<string, Slot[]>(pending.map((b, i) => [b.id, slotLists[i]]));
  const tab = (key: string, label: string) => (
    <Link
      href={key === "upcoming" ? "/merchant/bookings" : "/merchant/bookings?view=past"}
      aria-current={view === key ? "page" : undefined}
      className={cn(
        "rounded-full px-4 py-2 font-semibold",
        view === key ? "bg-ink-900 text-white" : "bg-white text-ink-800 ring-1 ring-ink-200",
      )}
    >
      {label}
    </Link>
  );
  return (
    <AreaShell area="merchant">
      <PageTitle title="Bookings" description="Appointment requests from students. Times are Ghana time." />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {tab("upcoming", "Requests and upcoming")}
        {tab("past", "Earlier")}
        <span className="ml-auto flex flex-wrap gap-4">
          <Link href="/merchant/problems" className="font-semibold text-blue-600">
            Problem reports
          </Link>
          {canManage(membership) && (
            <Link href="/merchant/bookings/setup" className="font-semibold text-blue-600">
              Booking hours
            </Link>
          )}
        </span>
      </div>
      {bookings.length === 0 ? (
        <EmptyState
          icon={<CalendarClock aria-hidden />}
          title={view === "past" ? "No earlier bookings" : "No bookings right now"}
          description={
            canManage(membership)
              ? "Make a service bookable and add hours under Booking hours. Students then see a Book button on your page."
              : "Requests for your branch show up here."
          }
        />
      ) : (
        <ul className="grid max-w-2xl gap-3">
          {bookings.map((b) => (
            <MerchantBookingCard key={b.id} booking={b} freeSlots={(slotsFor.get(b.id) ?? []).filter((s) => s.starts_at !== b.starts_at)} />
          ))}
        </ul>
      )}
    </AreaShell>
  );
}
