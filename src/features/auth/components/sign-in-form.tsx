"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { FieldError, Input, Label } from "@/components/ui/input";
import { requestSignInCode } from "../actions";
import { idleState } from "../types";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";
import { GoogleButton, OrDivider } from "./google-button";
import Link from "next/link";

export function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const linkExpired = params.get("link") === "expired";
  const google = params.get("google");
  const [state, action] = useActionState(requestSignInCode, idleState);
  return (
    <div className="space-y-6">
      <GoogleButton next={next || null} />
      {google && (
        <FormMessage
          state={{
            status: "error",
            message:
              google === "cancelled"
                ? "Google sign-in was cancelled. Try again, or use your email."
                : "Google sign-in didn't finish. Try again in the same browser, or use your email.",
          }}
        />
      )}
      <p className="text-sm text-ink-600">
        New to Perqly? Continuing with Google creates your account, and means you agree to the{" "}
        <Link href="/terms" className="font-semibold text-blue-600 underline underline-offset-2">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="font-semibold text-blue-600 underline underline-offset-2">
          privacy notice
        </Link>
        .
      </p>
      <OrDivider />
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
    </div>
  );
}
