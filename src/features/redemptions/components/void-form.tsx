"use client";

import { useActionState } from "react";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { voidRedemption } from "../actions";

export function VoidForm({ redemptionId }: { redemptionId: string }) {
  const [state, action] = useActionState(voidRedemption, idleState);
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="redemptionId" value={redemptionId} />
      <div>
        <Label htmlFor={`void-${redemptionId}`}>Reason (kept in the audit log)</Label>
        <Textarea id={`void-${redemptionId}`} name="reason" maxLength={500} invalid={Boolean(state.fieldErrors?.reason)} />
        {state.fieldErrors?.reason && <FieldError>{state.fieldErrors.reason}</FieldError>}
      </div>
      <SubmitButton variant="secondary" size="sm">
        Void redemption
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
