"use client";

import { useActionState, useState } from "react";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { moderateOffer } from "../actions";

const OPTIONS: Record<string, { value: string; label: string }[]> = {
  pending_review: [
    { value: "approve", label: "Approve: students can see it" },
    { value: "reject", label: "Send back with a reason" },
  ],
  active: [{ value: "takedown", label: "Take down: hide it from students" }],
  paused: [{ value: "takedown", label: "Take down: stop the business resuming it" }],
};

export function OfferModerationForm({ offerId, status }: { offerId: string; status: string }) {
  const [state, action] = useActionState(moderateOffer, idleState);
  const options = OPTIONS[status] ?? [];
  const [decision, setDecision] = useState(options[0]?.value ?? "");
  if (options.length === 0) return null;
  const needsReason = decision !== "approve";
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="offerId" value={offerId} />
      <fieldset className="space-y-2">
        <legend className="sr-only">Decision</legend>
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-ink-200">
            <input
              type="radio"
              name="decision"
              value={option.value}
              checked={decision === option.value}
              onChange={() => setDecision(option.value)}
              className="size-4 accent-blue-500"
            />
            <span className="font-medium text-ink-900">{option.label}</span>
          </label>
        ))}
      </fieldset>
      {needsReason && (
        <div>
          <Label htmlFor={`reason-${offerId}`}>Reason the business will see</Label>
          <Textarea id={`reason-${offerId}`} name="reason" invalid={Boolean(state.fieldErrors?.reason)} />
          {state.fieldErrors?.reason && <FieldError>{state.fieldErrors.reason}</FieldError>}
        </div>
      )}
      <SubmitButton size="sm">Confirm</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
