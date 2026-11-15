"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FieldError, Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requestSignUpCode } from "../actions";
import { idleState } from "../types";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";
import { GoogleButton, OrDivider } from "./google-button";

const intents = [
  { value: "student", title: "I'm a student", body: "Get verified by your school and use student discounts." },
  { value: "merchant", title: "I run a business", body: "Offer discounts to verified students near you." },
] as const;

export function SignUpForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const preset = params.get("as") === "merchant" ? "merchant" : "student";
  const [state, action] = useActionState(requestSignUpCode, idleState);
  const errors = state.fieldErrors ?? {};
  const form = useRef<HTMLFormElement>(null);

  // Google gives us the name and email; the person still chooses student or business and agrees to the terms.
  const prepareGoogle = () => {
    const data = new FormData(form.current ?? undefined);
    if (data.get("consent") !== "on") return "Tick the box to agree to the terms and privacy notice first.";
    return { intent: data.get("intent") === "merchant" ? ("merchant" as const) : ("student" as const) };
  };

  return (
    <form ref={form} action={action} noValidate className="space-y-6">
      <input type="hidden" name="next" value={next} />
      <fieldset aria-describedby={errors.intent ? "intent-error" : undefined}>
        <legend className="mb-2 block text-sm font-semibold text-ink-900">How will you use Perqly?</legend>
        <div className="grid gap-3">
          {intents.map((intent) => (
            <label
              key={intent.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl bg-white p-4 ring-1 ring-ink-300 transition-shadow ring-inset",
                "has-[:checked]:ring-2 has-[:checked]:ring-blue-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500",
              )}
            >
              <input
                type="radio"
                name="intent"
                value={intent.value}
                defaultChecked={intent.value === preset}
                className="mt-1 size-4 accent-blue-500"
              />
              <span>
                <span className="block font-semibold text-ink-900">{intent.title}</span>
                <span className="mt-0.5 block text-sm text-ink-600">{intent.body}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.intent && <FieldError id="intent-error">{errors.intent}</FieldError>}
      </fieldset>
      <div>
        <label className="flex items-start gap-3 text-[0.9375rem] leading-snug text-ink-700">
          <input
            type="checkbox"
            name="consent"
            className="mt-0.5 size-5 shrink-0 accent-blue-500"
            aria-describedby={errors.consent ? "consent-error" : undefined}
          />
          <span>
            I agree to Perqly&apos;s{" "}
            <Link href="/terms" className="font-semibold text-blue-600 underline underline-offset-2">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-semibold text-blue-600 underline underline-offset-2">
              privacy notice
            </Link>
            .
          </span>
        </label>
        {errors.consent && <FieldError id="consent-error">{errors.consent}</FieldError>}
      </div>
      <GoogleButton next={next || null} prepare={prepareGoogle} label="Sign up with Google" />
      <OrDivider />
      <div>
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
        />
        {errors.fullName && <FieldError id="fullName-error">{errors.fullName}</FieldError>}
      </div>
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
          invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : "email-hint"}
        />
        {errors.email ? (
          <FieldError id="email-error">{errors.email}</FieldError>
        ) : (
          <p id="email-hint" className="mt-2 text-sm text-ink-600">
            Any email you use. You&apos;ll confirm your school email later, during verification.
          </p>
        )}
      </div>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        Create account with email
      </SubmitButton>
    </form>
  );
}
