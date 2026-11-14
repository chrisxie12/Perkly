"use client";

import { useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { resendSignInCode, verifySignInCode } from "../actions";
import { idleState } from "../types";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

const RESEND_SECONDS = 60;

export function CodeForm() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action] = useActionState(verifySignInCode, idleState);
  const [resendState, resendAction, resending] = useActionState(resendSignInCode, idleState);
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  return (
    <div className="space-y-8">
      <form action={action} noValidate className="space-y-5">
        <input type="hidden" name="next" value={next} />
        <div>
          <Label htmlFor="code">6-digit code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={7}
            required
            autoFocus
            className="h-14 text-center font-display text-2xl font-bold tracking-[0.4em]"
            invalid={Boolean(state.fieldErrors?.code)}
            aria-describedby={state.fieldErrors?.code ? "code-error" : undefined}
          />
          {state.fieldErrors?.code && <FieldError id="code-error">{state.fieldErrors.code}</FieldError>}
        </div>
        <FormMessage state={state} />
        <SubmitButton size="lg" className="w-full">
          Continue
        </SubmitButton>
      </form>

      <form
        action={() => {
          setWait(RESEND_SECONDS);
          resendAction();
        }}
        className="space-y-3"
      >
        <FormMessage state={resendState} />
        <Button type="submit" variant="secondary" className="w-full" disabled={wait > 0} loading={resending}>
          {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
        </Button>
      </form>
    </div>
  );
}
