"use client";

import { useActionState } from "react";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState, type FormState } from "@/features/auth/types";
import type { ButtonProps } from "@/components/ui/button";

/** One button that runs one server action with fixed fields, then says what happened. */
export function ActionForm({
  action,
  fields,
  label,
  variant = "secondary",
  confirm,
  className,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  label: string;
  variant?: ButtonProps["variant"];
  confirm?: string;
  className?: string;
}) {
  const [state, run] = useActionState(action, idleState);
  return (
    <form
      action={run}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size="sm">
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
