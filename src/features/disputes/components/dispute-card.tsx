import { money } from "@/features/offers/schemas";
import { REASON_LABEL, STATUS_LABEL, formatWhen, type Dispute } from "../schemas";
import { NoteForm } from "./dispute-forms";

const PARTY: Record<string, string> = { student: "Student", merchant: "Business", support: "Perqly support" };

/** A report with its history, for the person who sent it or for support. */
export function DisputeCard({ dispute, staff = false, reply = true }: { dispute: Dispute; staff?: boolean; reply?: boolean }) {
  const closed = dispute.status === "resolved" || dispute.status === "dismissed";
  return (
    <article className="rounded-2xl bg-white p-4 ring-1 ring-ink-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold text-ink-900">{REASON_LABEL[dispute.reason] ?? dispute.reason}</h3>
          <p className="text-sm text-ink-600">
            {dispute.merchant.name} · sent {formatWhen(dispute.created_at)}
          </p>
        </div>
        <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-sm font-semibold text-ink-800">
          {STATUS_LABEL[dispute.status] ?? dispute.status}
        </span>
      </div>
      {dispute.redemption && (
        <p className="mt-2 text-sm text-ink-700">
          {dispute.redemption.item_name}, {dispute.redemption.transaction_ref}: paid {money(dispute.redemption.final_price)} of{" "}
          {money(dispute.redemption.regular_price)}
          {dispute.redemption.voided ? ". Cancelled by support." : "."}
        </p>
      )}
      {dispute.booking && (
        <p className="mt-2 text-sm text-ink-700">
          Booking: {dispute.booking.service ?? "service"}, {formatWhen(dispute.booking.starts_at)}
        </p>
      )}
      <p className="mt-3 whitespace-pre-line text-ink-800">{dispute.details}</p>
      {dispute.resolution && (
        <p className="mt-3 rounded-xl bg-green-50 p-3 text-ink-900">
          <span className="font-semibold">Decision:</span> {dispute.resolution}
        </p>
      )}
      <ol className="mt-4 space-y-2 border-t border-ink-100 pt-3">
        {dispute.events
          .filter((ev) => ev.kind !== "opened")
          .map((ev) => (
            <li key={ev.id} className={ev.kind === "internal_note" ? "rounded-lg bg-amber-50 p-2" : ""}>
              <p className="text-sm text-ink-600">
                {ev.mine ? "You" : (PARTY[ev.actor_party] ?? ev.actor_party)} · {formatWhen(ev.created_at)}
                {ev.kind === "internal_note" ? " · internal" : ""}
                {ev.kind === "status" && ev.status ? ` · ${STATUS_LABEL[ev.status] ?? ev.status}` : ""}
              </p>
              {ev.body && <p className="whitespace-pre-line text-ink-800">{ev.body}</p>}
            </li>
          ))}
      </ol>
      {reply && (!closed || staff) && (
        <div className="mt-4">
          <NoteForm disputeId={dispute.id} staff={staff} />
        </div>
      )}
    </article>
  );
}
