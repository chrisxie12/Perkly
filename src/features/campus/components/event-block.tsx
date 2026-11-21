"use client";

import { startTransition, useOptimistic, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, MapPin, Ticket, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { setRsvp, takeTicket } from "../engage-actions";
import { formatCedis, formatEventTime, goingLabel, savingLabel, type CampusEvent } from "../schemas";

/** When and where, how many are going, and the student's RSVP. */
export function EventBlock({ postId, event, canRsvp = true }: { postId: string; event: CampusEvent; canRsvp?: boolean }) {
  const [shown, setShown] = useOptimistic(event);
  const [error, setError] = useState<string | null>(null);
  const full = shown.capacity !== null && shown.going >= shown.capacity;
  const closedReason = shown.over
    ? "This event has finished."
    : !shown.rsvp_open
      ? "RSVPs are closed."
      : full && !shown.i_am_going
        ? "This event is full."
        : null;
  return (
    <section aria-label="Event" className="mt-5 rounded-2xl bg-blue-50 p-4 text-ink-900">
      <p className="flex items-start gap-2 font-semibold">
        <CalendarDays className="mt-0.5 size-5 shrink-0 text-blue-600" aria-hidden />
        {formatEventTime(shown.starts_at, shown.ends_at)}
      </p>
      <p className="mt-1 flex items-start gap-2">
        <MapPin className="mt-0.5 size-5 shrink-0 text-blue-600" aria-hidden />
        {shown.venue}
      </p>
      <p className="mt-1 flex items-start gap-2 text-ink-700">
        <Users className="mt-0.5 size-5 shrink-0 text-blue-600" aria-hidden />
        <span aria-live="polite">{goingLabel(shown)}</span>
      </p>
      {shown.ticketed && shown.normal_price !== null && shown.student_price !== null && (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-2xl font-extrabold">{formatCedis(shown.student_price)}</span>
          <span className="text-ink-700 line-through">{formatCedis(shown.normal_price)}</span>
          <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-bold text-ink-900">
            {savingLabel(shown.normal_price, shown.student_price)}
          </span>
          <span className="w-full text-sm text-ink-700">Student price, paid at the door.</span>
        </p>
      )}
      {canRsvp && (
        <div className="mt-3">
          {shown.ticketed && shown.my_ticket ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/student/campus/tickets/${postId}`} className={buttonVariants({ size: "sm" })}>
                <Ticket aria-hidden /> {shown.my_ticket.status === "checked_in" ? "You're in" : "Show my ticket"}
              </Link>
              {!shown.over && shown.my_ticket.status === "active" && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    startTransition(async () => {
                      setShown({ ...shown, i_am_going: false, my_ticket: null, going: Math.max(0, shown.going - 1) });
                      const r = await setRsvp(postId, false);
                      setError(r.ok ? null : r.message);
                    })
                  }
                >
                  Cancel ticket
                </Button>
              )}
            </div>
          ) : shown.i_am_going ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 font-semibold text-green-800">
                <Check className="size-5" aria-hidden /> You&apos;re going
              </span>
              {!shown.over && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    startTransition(async () => {
                      setShown({ ...shown, i_am_going: false, going: Math.max(0, shown.going - 1) });
                      const r = await setRsvp(postId, false);
                      setError(r.ok ? null : r.message);
                    })
                  }
                >
                  Can&apos;t go
                </Button>
              )}
            </div>
          ) : closedReason ? (
            <p className="font-medium text-ink-700">{closedReason}</p>
          ) : shown.ticketed ? (
            <Button
              type="button"
              size="sm"
              onClick={() =>
                startTransition(async () => {
                  const r = await takeTicket(postId);
                  if (r.ok) setShown(r.event);
                  setError(r.ok ? null : r.message);
                })
              }
            >
              <Ticket aria-hidden /> Get ticket
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() =>
                startTransition(async () => {
                  setShown({ ...shown, i_am_going: true, going: shown.going + 1 });
                  const r = await setRsvp(postId, true);
                  setError(r.ok ? null : r.message);
                })
              }
            >
              I&apos;m going
            </Button>
          )}
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      )}
    </section>
  );
}
