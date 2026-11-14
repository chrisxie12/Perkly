import { SubmitButton } from "@/features/auth/components/submit-button";
import { recordPayment } from "../actions";
import { PAYMENT_METHODS } from "../schemas";

export function PaymentForm({ redemptionId, method, status }: { redemptionId: string; method: string | null; status: string | null }) {
  return (
    <form action={recordPayment} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="redemptionId" value={redemptionId} />
      <label className="sr-only" htmlFor={`method-${redemptionId}`}>
        How the student paid
      </label>
      <select
        id={`method-${redemptionId}`}
        name="method"
        defaultValue={method ?? "mtn_momo"}
        className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-ink-200"
      >
        {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`status-${redemptionId}`}>
        Paid or not
      </label>
      <select
        id={`status-${redemptionId}`}
        name="status"
        defaultValue={status ?? "paid"}
        className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-ink-200"
      >
        <option value="paid">Paid</option>
        <option value="unpaid">Not paid</option>
      </select>
      <SubmitButton size="sm" variant="secondary">
        Save note
      </SubmitButton>
    </form>
  );
}
