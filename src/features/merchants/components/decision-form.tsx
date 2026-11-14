"use client";

import { useActionState, useState } from "react";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { decideMerchant } from "../actions";

const OPTIONS: Record<string, { value: string; label: string }[]> = {
  pending_review: [
    { value: "approve", label: "Approve: the business goes live" },
    { value: "reject", label: "Send back with a reason" },
  ],
  approved: [{ value: "suspend", label: "Suspend: hide it from students" }],
  suspended: [{ value: "reinstate", label: "Reinstate: make it live again" }],
};

export function MerchantDecisionForm({ merchantId, status }: { merchantId: string; status: string }) {
  const [state, action] = useActionState(decideMerchant, idleState);
  const options = OPTIONS[status] ?? [];
  const [decision, setDecision] = useState(options[0]?.value ?? "");
  if (options.length === 0) return <p className="text-ink-700">No decision is needed while the business is setting up.</p>;
  const needsReason = decision === "reject" || decision === "suspend";
  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="merchantId" value={merchantId} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-ink-900">Decision</legend>
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
          <Label htmlFor="reason">Reason the owner will see</Label>
          <Textarea id="reason" name="reason" invalid={Boolean(state.fieldErrors?.reason)} />
          {state.fieldErrors?.reason && <FieldError>{state.fieldErrors.reason}</FieldError>}
        </div>
      )}
      <SubmitButton>Confirm decision</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
