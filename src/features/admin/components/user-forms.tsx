"use client";

import { useActionState } from "react";
import { FieldError, FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { completeDeletion, declineDeletion, openDeletionRequest, setSuspension } from "../user-actions";

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

export function CompleteDeletionForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(completeDeletion, idleState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <Label htmlFor={`note-${requestId}`}>How they asked</Label>
        <Textarea
          id={`note-${requestId}`}
          name="note"
          maxLength={500}
          defaultValue="Asked in the app"
          invalid={Boolean(state.fieldErrors?.note)}
        />
        {state.fieldErrors?.note && <FieldError>{state.fieldErrors.note}</FieldError>}
      </div>
      <div>
        <Label htmlFor={`confirm-${requestId}`}>Type DELETE to confirm</Label>
        <Input
          id={`confirm-${requestId}`}
          name="confirm"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          invalid={Boolean(state.fieldErrors?.confirm)}
        />
        <FieldHint>This can&apos;t be undone. They get a confirmation email.</FieldHint>
        {state.fieldErrors?.confirm && <FieldError>{state.fieldErrors.confirm}</FieldError>}
      </div>
      <SubmitButton size="sm">Delete account</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DeclineDeletionForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(declineDeletion, idleState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <Label htmlFor={`decline-${requestId}`}>Why it isn&apos;t being deleted</Label>
        <Textarea id={`decline-${requestId}`} name="note" maxLength={500} invalid={Boolean(state.fieldErrors?.note)} />
        {state.fieldErrors?.note && <FieldError>{state.fieldErrors.note}</FieldError>}
      </div>
      <SubmitButton variant="secondary" size="sm">
        Don&apos;t delete
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function OpenDeletionRequestForm({ userId }: { userId: string }) {
  const [state, action] = useActionState(openDeletionRequest, idleState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <Label htmlFor={`emailed-${userId}`}>When and from which address they emailed</Label>
        <Textarea id={`emailed-${userId}`} name="note" maxLength={500} invalid={Boolean(state.fieldErrors?.note)} />
        <FieldHint>Only record it if the email came from this account&apos;s own address.</FieldHint>
        {state.fieldErrors?.note && <FieldError>{state.fieldErrors.note}</FieldError>}
      </div>
      <SubmitButton variant="secondary" size="sm">
        Record deletion request
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
