import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { StudentBookingCard } from "@/features/bookings/components/booking-cards";
import { getMyBookings } from "@/features/bookings/queries";
import { isOpen } from "@/features/bookings/schemas";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };

export default async function MyBookingsPage({ searchParams }: PageProps<"/student/bookings">) {
  const requested = (await searchParams).requested === "1";
  const bookings = await getMyBookings();
  const upcoming = bookings.filter((b) => isOpen(b.status));
  const past = bookings.filter((b) => !isOpen(b.status));
  return (
    <AreaShell area="student">
      <PageTitle title="My bookings" description="Appointments you've requested at shops. Times are Ghana time." />
      {requested && (
        <p role="status" className="mb-6 rounded-xl bg-green-50 px-4 py-3 font-medium text-green-800">
          Request sent. The shop will confirm or propose another time.
        </p>
      )}
      {bookings.length === 0 ? (
        <EmptyState
          icon={<CalendarClock aria-hidden />}
          title="No bookings yet"
          description="Shops that take appointments show a Book button on their page."
          action={
            <Link href="/student" className={buttonVariants()}>
              Find a shop
            </Link>
          }
        />
      ) : (
        <div className="grid max-w-2xl gap-8">
          {upcoming.length > 0 && (
            <section aria-labelledby="upcoming">
              <h2 id="upcoming" className="mb-3 font-display text-xl font-bold">
                Coming up
              </h2>
              <ul className="space-y-3">
                {upcoming.map((b) => (
                  <StudentBookingCard key={b.id} booking={b} />
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section aria-labelledby="past">
              <h2 id="past" className="mb-3 font-display text-xl font-bold">
                Earlier
              </h2>
              <ul className="space-y-3">
                {past.map((b) => (
                  <StudentBookingCard key={b.id} booking={b} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </AreaShell>
  );
}
