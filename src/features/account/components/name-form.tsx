"use client";

import { useActionState } from "react";
import { FieldError, Input, Label } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { saveName } from "../actions";

export function NameForm({ fullName, firstName }: { fullName: string; firstName: string }) {
  const [state, action] = useActionState(saveName, idleState);
  return (
    <form action={action} noValidate className="space-y-4">
      <div>
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" defaultValue={fullName} autoComplete="name" invalid={Boolean(state.fieldErrors?.fullName)} />
        {state.fieldErrors?.fullName && <FieldError>{state.fieldErrors.fullName}</FieldError>}
      </div>
      <div>
        <Label htmlFor="firstName">What should we call you?</Label>
        <Input
          id="firstName"
          name="firstName"
          defaultValue={firstName}
          autoComplete="given-name"
          invalid={Boolean(state.fieldErrors?.firstName)}
        />
        {state.fieldErrors?.firstName && <FieldError>{state.fieldErrors.firstName}</FieldError>}
        <p className="mt-1 text-sm text-ink-600">Cashiers see this name on your pass.</p>
      </div>
      <SubmitButton>Save</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
