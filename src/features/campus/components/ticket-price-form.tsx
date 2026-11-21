"use client";

import * as React from "react";
import { useActionState } from "react";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { saveTicketPrices } from "../engage-actions";
import { formatCedis, type CampusEvent } from "../schemas";

const cedis = (p: number | null) => (p === null ? "" : String(p / 100));

/**
 * Organisers give an event a normal price and a lower student price. Students take a
 * ticket in Perqly and pay the student price at the door. No money moves through Perqly.
 */
export function TicketPriceForm({ postId, organisationId, event }: { postId: string; organisationId: string; event: CampusEvent }) {
  const [state, action] = useActionState(saveTicketPrices, idleState);
  const [sold, setSold] = React.useState(event.ticketed);
  const e = state.fieldErrors ?? {};
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold">Tickets</h2>
      <p className="text-sm text-ink-700">
        Verified students take a ticket in Perqly and pay you the student price at the door. Perqly doesn&apos;t handle the money.
      </p>
      <form action={action} noValidate className="space-y-4">
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="organisationId" value={organisationId} />
        <label className="flex items-start gap-3 text-ink-700">
          <input
            type="checkbox"
            name="ticketed"
            checked={sold}
            onChange={(ev) => setSold(ev.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-blue-500"
          />
          <span>This event has paid entry</span>
        </label>
        {sold && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tk-normal">Normal price (GH₵)</Label>
              <Input
                id="tk-normal"
                name="normal"
                inputMode="decimal"
                defaultValue={cedis(event.normal_price)}
                invalid={Boolean(e.normal)}
              />
              {e.normal ? <FieldError>{e.normal}</FieldError> : <FieldHint>What everyone else pays.</FieldHint>}
            </div>
            <div>
              <Label htmlFor="tk-student">Student price (GH₵)</Label>
              <Input
                id="tk-student"
                name="student"
                inputMode="decimal"
                defaultValue={cedis(event.student_price)}
                invalid={Boolean(e.student)}
              />
              {e.student ? <FieldError>{e.student}</FieldError> : <FieldHint>Perqly students pay this.</FieldHint>}
            </div>
          </div>
        )}
        {event.ticketed && event.normal_price !== null && event.student_price !== null && (
          <p className="text-sm text-ink-700">
            Now: {formatCedis(event.normal_price)} normally, {formatCedis(event.student_price)} for students.
          </p>
        )}
        <SubmitButton size="sm">Save tickets</SubmitButton>
        <FormMessage state={state} />
      </form>
    </div>
  );
}
