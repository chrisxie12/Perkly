import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft } from "lucide-react";
import { AreaShell, PageTitle } from "@/components/layout/area-shell";
import { EmptyState } from "@/components/shared/states";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMyStudentStatus } from "@/features/students/queries";
import { verificationView } from "@/features/students/status";
import { getCampusEnabled, getMyEvents, getUpcomingEvents } from "@/features/campus/queries";
import { decodeCursor, formatEventTime, goingLabel, nextEventCursor, type CampusEventPost } from "@/features/campus/schemas";
import { CampusClosed } from "@/features/campus/components/campus-closed";

export const metadata: Metadata = { title: "Campus events", robots: { index: false } };

function EventList({ events }: { events: CampusEventPost[] }) {
  return (
    <ul className="space-y-3">
      {events.map((e) => (
        <li key={e.id}>
          <Link
            href={`/student/campus/posts/${e.id}`}
            className="block rounded-2xl bg-white p-4 ring-1 ring-ink-200 hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <p className="text-sm font-semibold text-blue-700">{formatEventTime(e.event.starts_at, e.event.ends_at)}</p>
            <p className="mt-1 font-display text-lg font-bold text-ink-900">{e.title}</p>
            <p className="text-sm text-ink-600">
              {e.organisation.name} · {e.event.venue}
            </p>
            <p className="mt-1 text-sm text-ink-700">
              {e.event.i_am_going ? "You're going · " : ""}
              {goingLabel(e.event)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function CampusEventsPage({ searchParams }: PageProps<"/student/campus/events">) {
  const [enabled, status] = await Promise.all([getCampusEnabled(), getMyStudentStatus()]);
  if (!enabled.posts) return <CampusClosed />;
  const back = (
    <Link href="/student/campus" className="mb-4 inline-flex items-center gap-1 font-semibold text-blue-600">
      <ChevronLeft className="size-5" aria-hidden /> Campus
    </Link>
  );
  if (verificationView(status) !== "verified") {
    return (
      <AreaShell area="student">
        {back}
        <PageTitle title="Events" />
        <EmptyState
          icon={<CalendarDays aria-hidden />}
          title="Verify to see your school's events"
          description="Events are for verified students of each school."
          action={
            <Link href="/student/verify" className={buttonVariants()}>
              Verify your student status
            </Link>
          }
        />
      </AreaShell>
    );
  }
  const cursor = decodeCursor((await searchParams).after);
  const [upcoming, mine] = await Promise.all([getUpcomingEvents(cursor), cursor ? Promise.resolve([]) : getMyEvents()]);
  const next = nextEventCursor(upcoming);
  return (
    <AreaShell area="student">
      {back}
      <PageTitle title="Events" description="What's coming up at your school, soonest first. Times are Ghana time." />
      {mine.length > 0 && (
        <section aria-labelledby="going" className="mb-8">
          <h2 id="going" className="mb-3 font-display text-xl font-bold">
            You&apos;re going
          </h2>
          <EventList events={mine} />
        </section>
      )}
      <section aria-labelledby="upcoming">
        <h2 id="upcoming" className="mb-3 font-display text-xl font-bold">
          Coming up
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarDays aria-hidden />}
            title="No events coming up"
            description="When your school's organisations post events, they show up here."
          />
        ) : (
          <EventList events={upcoming} />
        )}
      </section>
      {next && (
        <Link href={`/student/campus/events?after=${next}`} className={cn(buttonVariants({ variant: "secondary" }), "mt-6")}>
          Later events
        </Link>
      )}
    </AreaShell>
  );
}
