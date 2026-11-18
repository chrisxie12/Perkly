"use client";

import { useActionState, useId } from "react";
import { FieldError, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { requestBooking } from "../actions";
import { formatSlotTime, type Slot } from "../schemas";

/** Pick one of the day's free times, add a note, send the request. */
export function RequestForm({
  branchId,
  serviceId,
  slots,
  deals,
  requestId,
}: {
  branchId: string;
  serviceId: string;
  slots: Slot[];
  deals: { id: string; label: string }[];
  requestId: string;
}) {
  const [state, action] = useActionState(requestBooking, idleState);
  const e = state.fieldErrors ?? {};
  const id = useId();
  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="requestId" value={requestId} />
      <fieldset>
        <legend className="mb-2 font-semibold text-ink-900">Free times</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((s) => (
            <label
              key={s.starts_at}
              className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-white font-semibold ring-1 ring-ink-200 has-[:checked]:bg-blue-600 has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-500"
            >
              <input type="radio" name="startsAt" value={s.starts_at} className="sr-only" required />
              {formatSlotTime(s.starts_at)}
            </label>
          ))}
        </div>
        {e.startsAt && <FieldError>{e.startsAt}</FieldError>}
      </fieldset>
      {deals.length > 0 && (
        <div>
          <Label htmlFor={`${id}-deal`}>Deal you plan to use (optional)</Label>
          <NativeSelect id={`${id}-deal`} name="offerId" defaultValue="">
            <option value="">None</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <div>
        <Label htmlFor={`${id}-note`}>Note to the shop (optional)</Label>
        <Textarea id={`${id}-note`} name="note" rows={3} maxLength={500} invalid={Boolean(e.note)} />
        {e.note && <FieldError>{e.note}</FieldError>}
      </div>
      <p className="text-sm text-ink-600">The shop confirms or proposes another time. You&apos;ll get a notification.</p>
      <SubmitButton>Request booking</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
