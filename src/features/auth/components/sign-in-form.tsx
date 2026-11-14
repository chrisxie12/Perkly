"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { FieldError, Input, Label } from "@/components/ui/input";
import { requestSignInCode } from "../actions";
import { idleState } from "../types";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

export function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const linkExpired = params.get("link") === "expired";
  const [state, action] = useActionState(requestSignInCode, idleState);
  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        />
        {state.fieldErrors?.email && <FieldError id="email-error">{state.fieldErrors.email}</FieldError>}
      </div>
      {linkExpired && state.status === "idle" && (
        <FormMessage
          state={{ status: "error", message: "That sign-in link has expired or was already used. Enter your email for a new code." }}
        />
      )}
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        Send me a code
      </SubmitButton>
    </form>
  );
}
