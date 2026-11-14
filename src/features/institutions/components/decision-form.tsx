"use client";

import { useActionState, useState } from "react";
import { FieldError, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { cn } from "@/lib/utils";
import { decideApplication } from "../actions";

const decisions = [
  { value: "approve", title: "Approve", body: "This person is a current student and the details match." },
  { value: "request_resubmission", title: "Ask for changes", body: "Something needs fixing, such as a blurred photo." },
  { value: "reject", title: "Reject", body: "This person can't be verified as a student." },
] as const;

const reasons = [
  { value: "not_enrolled", label: "Not currently enrolled" },
  { value: "id_mismatch", label: "Student ID doesn't match our records" },
  { value: "photo_mismatch", label: "Selfie doesn't match the ID photo" },
  { value: "unreadable_documents", label: "Documents unreadable" },
  { value: "duplicate_account", label: "Duplicate account" },
  { value: "other", label: "Other (explain in the note)" },
];

export function DecisionForm({ applicationId }: { applicationId: string }) {
  const [state, action] = useActionState(decideApplication, idleState);
  const [decision, setDecision] = useState<string>("");
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="applicationId" value={applicationId} />
      <fieldset>
        <legend className="mb-2 block text-sm font-semibold text-ink-900">Decision</legend>
        <div className="grid gap-3">
          {decisions.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl bg-white p-4 ring-1 ring-ink-300 ring-inset",
                "has-[:checked]:ring-2 has-[:checked]:ring-blue-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500",
              )}
            >
              <input
                type="radio"
                name="decision"
                value={option.value}
                onChange={() => setDecision(option.value)}
                className="mt-1 size-4 accent-blue-500"
              />
              <span>
                <span className="block font-semibold text-ink-900">{option.title}</span>
                <span className="mt-0.5 block text-sm text-ink-600">{option.body}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.decision && <FieldError>{errors.decision}</FieldError>}
      </fieldset>

      {decision === "reject" && (
        <div>
          <Label htmlFor="reason">Reason</Label>
          <NativeSelect id="reason" name="reason" defaultValue="" invalid={Boolean(errors.reason)}>
            <option value="">Choose a reason</option>
            {reasons.map((reason) => (
              <option key={reason.value} value={reason.value}>
                {reason.label}
              </option>
            ))}
          </NativeSelect>
          {errors.reason && <FieldError>{errors.reason}</FieldError>}
        </div>
      )}

      {decision !== "" && (
        <div>
          <Label htmlFor="note">
            {decision === "request_resubmission" ? "What should the student change?" : "Note to the student (optional)"}
          </Label>
          <Textarea id="note" name="note" maxLength={500} invalid={Boolean(errors.note)} />
          {errors.note && <FieldError>{errors.note}</FieldError>}
        </div>
      )}

      <FormMessage state={state} />
      <SubmitButton size="lg" disabled={decision === ""}>
        Record decision
      </SubmitButton>
    </form>
  );
}
