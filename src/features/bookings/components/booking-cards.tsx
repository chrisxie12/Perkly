"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CalendarClock, MapPin } from "lucide-react";
import { FieldError, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { ActionForm } from "@/features/campus/components/action-form";
import { answerBooking, answerReschedule, cancelBooking, markBooking } from "../actions";
import { BOOKING_STATUS_LABEL, formatBookingTime, formatSlotTime, isOpen, markWindow, type Booking, type Slot } from "../schemas";

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "confirmed" || status === "completed"
      ? "bg-green-50 text-green-800"
      : status === "pending" || status === "reschedule_requested"
        ? "bg-amber-50 text-amber-900"
        : "bg-ink-100 text-ink-700";
  return <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${tone}`}>{BOOKING_STATUS_LABEL[status] ?? status}</span>;
}

function When({ booking }: { booking: Booking }) {
  return (
    <>
      <p className="flex items-start gap-2 text-ink-800">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-blue-600" aria-hidden />
        {formatBookingTime(booking.starts_at)}
      </p>
      <p className="flex items-start gap-2 text-ink-700">
        <MapPin className="mt-0.5 size-5 shrink-0 text-blue-600" aria-hidden />
        {booking.branch.name}
        {booking.branch.area ? `, ${booking.branch.area}` : ""}
      </p>
    </>
  );
}

/** A student's booking, with what they can do next. */
export function StudentBookingCard({ booking }: { booking: Booking }) {
  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-bold text-ink-900">{booking.service.name}</p>
          <Link href={`/student/merchants/${booking.merchant.slug}`} className="font-medium text-blue-700">
            {booking.merchant.name}
          </Link>
        </div>
        <StatusPill status={booking.status} />
      </div>
      <div className="mt-3 space-y-1">
        <When booking={booking} />
      </div>
      {booking.offer && (
        <p className="mt-2 text-sm text-ink-700">
          Deal: {booking.offer.title ?? "Student discount"}. Scan the shop&apos;s code after your visit.
        </p>
      )}
      {booking.merchant_note && <p className="mt-2 text-sm text-ink-700">From the shop: {booking.merchant_note}</p>}
      {booking.status === "cancelled" && (
        <p className="mt-2 text-sm text-ink-600">
          {booking.cancelled_by_party === "student"
            ? "You cancelled."
            : booking.cancelled_by_party === "system"
              ? "Not answered in time."
              : "Cancelled by the shop."}
          {booking.cancel_reason && booking.cancelled_by_party === "merchant" ? ` ${booking.cancel_reason}` : ""}
        </p>
      )}
      {booking.status === "reschedule_requested" && booking.proposed_starts_at && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3">
          <p className="font-semibold text-ink-900">The shop proposed {formatBookingTime(booking.proposed_starts_at)}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ActionForm
              action={answerReschedule}
              fields={{ bookingId: booking.id, accept: "1" }}
              label="Accept new time"
              variant="primary"
            />
            <ActionForm
              action={answerReschedule}
              fields={{ bookingId: booking.id, accept: "0" }}
              label="Decline"
              confirm="Decline the new time? Your booking will be cancelled."
            />
          </div>
        </div>
      )}
      {!isOpen(booking.status) && booking.status !== "expired" && (
        <Link
          href={`/student/problems/new?booking=${booking.id}`}
          className="mt-3 inline-flex text-sm font-semibold text-ink-600 underline-offset-2 hover:underline"
        >
          Report a problem
        </Link>
      )}
      {isOpen(booking.status) && booking.status !== "reschedule_requested" && (
        <div className="mt-3">
          <ActionForm
            action={cancelBooking}
            fields={{ bookingId: booking.id }}
            label="Cancel booking"
            variant="ghost"
            confirm="Cancel this booking? The shop will be told."
          />
        </div>
      )}
    </li>
  );
}

function ProposeForm({ booking, slots }: { booking: Booking; slots: Slot[] }) {
  const [state, action] = useActionState(answerBooking, idleState);
  const e = state.fieldErrors ?? {};
  if (slots.length === 0) return <p className="text-sm text-ink-600">No other free times that day to propose.</p>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="bookingId" value={booking.id} />
      <input type="hidden" name="action" value="propose" />
      <Label htmlFor={`p-${booking.id}`}>Propose another time that day</Label>
      <NativeSelect id={`p-${booking.id}`} name="proposedAt" defaultValue="" invalid={Boolean(e.proposedAt)}>
        <option value="" disabled>
          Choose a free time
        </option>
        {slots.map((s) => (
          <option key={s.starts_at} value={s.starts_at}>
            {formatSlotTime(s.starts_at)}
          </option>
        ))}
      </NativeSelect>
      {e.proposedAt && <FieldError>{e.proposedAt}</FieldError>}
      <Textarea name="note" rows={2} maxLength={500} placeholder="Optional note to the student" aria-label="Note to the student" />
      <SubmitButton size="sm" variant="secondary">
        Propose time
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** A booking at the shop, with the shop's next steps. */
export function MerchantBookingCard({ booking, freeSlots }: { booking: Booking; freeSlots: Slot[] }) {
  const { done: started, noShow: noShowFrom } = markWindow(booking.starts_at);
  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-lg font-bold text-ink-900">{booking.student_name ?? "Student"}</p>
          <p className="text-ink-700">{booking.service.name}</p>
        </div>
        <StatusPill status={booking.status} />
      </div>
      <div className="mt-3 space-y-1">
        <When booking={booking} />
      </div>
      {booking.offer && <p className="mt-2 text-sm text-ink-700">Plans to use: {booking.offer.title ?? "a student discount"}.</p>}
      {booking.student_note && <p className="mt-2 text-sm text-ink-700">Note: {booking.student_note}</p>}
      {booking.status === "reschedule_requested" && booking.proposed_starts_at && (
        <p className="mt-2 text-sm text-ink-700">You proposed {formatBookingTime(booking.proposed_starts_at)}. Waiting for the student.</p>
      )}
      {booking.status === "pending" && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <ActionForm action={answerBooking} fields={{ bookingId: booking.id, action: "confirm" }} label="Confirm" variant="primary" />
            <ActionForm
              action={answerBooking}
              fields={{ bookingId: booking.id, action: "reject" }}
              label="Decline"
              confirm="Decline this request? The student will be told."
            />
          </div>
          <ProposeForm booking={booking} slots={freeSlots} />
        </div>
      )}
      {(booking.status === "completed" || booking.status === "no_show" || booking.status === "cancelled") && (
        <Link
          href={`/merchant/problems/new?booking=${booking.id}`}
          className="mt-3 inline-flex text-sm font-semibold text-ink-600 underline-offset-2 hover:underline"
        >
          Report a problem
        </Link>
      )}
      {booking.status === "confirmed" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {started && <ActionForm action={markBooking} fields={{ bookingId: booking.id, outcome: "completed" }} label="Mark done" />}
          {noShowFrom && (
            <ActionForm
              action={markBooking}
              fields={{ bookingId: booking.id, outcome: "no_show" }}
              label="Didn't come"
              variant="ghost"
              confirm="Mark this student as not coming?"
            />
          )}
          <ActionForm
            action={cancelBooking}
            fields={{ bookingId: booking.id }}
            label="Cancel"
            variant="ghost"
            confirm="Cancel this booking? The student will be told."
          />
        </div>
      )}
    </li>
  );
}
