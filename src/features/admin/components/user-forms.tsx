"use client";

import { useActionState, useState } from "react";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { resolveDeletion, setSuspension } from "../user-actions";

export function SuspensionForm({ userId, suspended }: { userId: string; suspended: boolean }) {
  const [state, action] = useActionState(setSuspension, idleState);
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="suspend" value={suspended ? "false" : "true"} />
      {!suspended && (
        <div>
          <Label htmlFor={`reason-${userId}`}>Reason they will see</Label>
          <Textarea id={`reason-${userId}`} name="reason" maxLength={300} invalid={Boolean(state.fieldErrors?.reason)} />
          {state.fieldErrors?.reason && <FieldError>{state.fieldErrors.reason}</FieldError>}
        </div>
      )}
      <SubmitButton variant="secondary" size="sm">
        {suspended ? "Restore account" : "Suspend account"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DeletionForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(resolveDeletion, idleState);
  const [status, setStatus] = useState("completed");
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">Outcome</legend>
        {[
          ["completed", "Deleted"],
          ["declined", "Not deleted"],
        ].map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 font-medium text-ink-900">
            <input
              type="radio"
              name="status"
              value={value}
              checked={status === value}
              onChange={() => setStatus(value)}
              className="size-4 accent-blue-500"
            />{" "}
            {label}
          </label>
        ))}
      </fieldset>
      <div>
        <Label htmlFor={`note-${requestId}`}>What was done</Label>
        <Textarea id={`note-${requestId}`} name="note" maxLength={500} invalid={Boolean(state.fieldErrors?.note)} />
        {state.fieldErrors?.note && <FieldError>{state.fieldErrors.note}</FieldError>}
      </div>
      <SubmitButton variant="secondary" size="sm">
        Record outcome
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
