"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { FieldError, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { addDisputeNote, openDispute, setDisputeStatus } from "../actions";
import { MERCHANT_REASONS, STUDENT_REASONS } from "../schemas";

export function OpenDisputeForm({
  area,
  redemptionId,
  bookingId,
}: {
  area: "student" | "merchant";
  redemptionId?: string;
  bookingId?: string;
}) {
  const [state, action] = useActionState(openDispute, idleState);
  const e = state.fieldErrors ?? {};
  const id = useId();
  const reasons = Object.entries(area === "student" ? STUDENT_REASONS : MERCHANT_REASONS);
  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="area" value={area} />
      {redemptionId && <input type="hidden" name="redemptionId" value={redemptionId} />}
      {bookingId && <input type="hidden" name="bookingId" value={bookingId} />}
      <div>
        <Label htmlFor={`${id}-r`}>What went wrong?</Label>
        <NativeSelect id={`${id}-r`} name="reason" defaultValue="" invalid={Boolean(e.reason)}>
          <option value="" disabled>
            Choose one
          </option>
          {reasons.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
        {e.reason && <FieldError>{e.reason}</FieldError>}
      </div>
      <div>
        <Label htmlFor={`${id}-d`}>What happened</Label>
        <Textarea id={`${id}-d`} name="details" rows={5} maxLength={2000} invalid={Boolean(e.details)} />
        {e.details && <FieldError>{e.details}</FieldError>}
      </div>
      <p className="text-sm text-ink-600">
        Perqly support reads every report and replies here. Don&apos;t include card numbers or passwords.
      </p>
      <SubmitButton>Send report</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function NoteForm({ disputeId, staff = false }: { disputeId: string; staff?: boolean }) {
  const [state, action] = useActionState(addDisputeNote, idleState);
  const e = state.fieldErrors ?? {};
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);
  const id = useId();
  return (
    <form ref={ref} action={action} noValidate className="space-y-3">
      <input type="hidden" name="disputeId" value={disputeId} />
      <Label htmlFor={`${id}-n`}>{staff ? "Add a note" : "Reply"}</Label>
      <Textarea id={`${id}-n`} name="body" rows={3} maxLength={2000} invalid={Boolean(e.body)} />
      {e.body && <FieldError>{e.body}</FieldError>}
      {staff && (
        <label className="flex items-center gap-2 text-ink-700">
          <input type="checkbox" name="internal" className="size-5 accent-blue-500" /> Internal note (only Perqly staff see it)
        </label>
      )}
      <SubmitButton size="sm" variant="secondary">
        {staff ? "Add note" : "Send reply"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function StatusForm({ disputeId, current }: { disputeId: string; current: string }) {
  const [state, action] = useActionState(setDisputeStatus, idleState);
  const e = state.fieldErrors ?? {};
  const id = useId();
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="disputeId" value={disputeId} />
      <div>
        <Label htmlFor={`${id}-s`}>Status</Label>
        <NativeSelect id={`${id}-s`} name="status" defaultValue={current}>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </NativeSelect>
      </div>
      <div>
        <Label htmlFor={`${id}-r`}>Decision (needed to resolve or dismiss; the reporter sees it)</Label>
        <Textarea id={`${id}-r`} name="resolution" rows={3} maxLength={1000} invalid={Boolean(e.resolution)} />
        {e.resolution && <FieldError>{e.resolution}</FieldError>}
      </div>
      <SubmitButton size="sm">Save status</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
