"use client";

import { useActionState, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { startTotpEnrollment, verifyTotp } from "../actions";
import { idleState, type TotpEnrollment } from "../types";
import { FormMessage } from "./form-message";
import { SubmitButton } from "./submit-button";

function TotpCodeForm({ factorId, label = "Code from your authenticator app" }: { factorId: string; label?: string }) {
  const next = useSearchParams().get("next") ?? "";
  const [state, action] = useActionState(verifyTotp, idleState);
  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="totp">{label}</Label>
        <Input
          id="totp"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          className="h-14 text-center font-display text-2xl font-bold tracking-[0.4em]"
          invalid={Boolean(state.fieldErrors?.code)}
          aria-describedby={state.fieldErrors?.code ? "totp-error" : undefined}
        />
        {state.fieldErrors?.code && <FieldError id="totp-error">{state.fieldErrors.code}</FieldError>}
      </div>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full">
        Verify
      </SubmitButton>
    </form>
  );
}

export function TotpChallenge({ factorId }: { factorId: string }) {
  return <TotpCodeForm factorId={factorId} />;
}

export function TotpSetup() {
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!enrollment) {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-2 pl-5 text-ink-700">
          <li>Install an authenticator app, such as Google Authenticator or Microsoft Authenticator.</li>
          <li>Scan the code we show you, then enter the 6-digit number the app displays.</li>
        </ol>
        {message && <FormMessage state={{ status: "error", message }} />}
        <Button
          size="lg"
          className="w-full"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await startTotpEnrollment();
              if (result.ok) setEnrollment(result.enrollment);
              else setMessage(result.message);
            })
          }
        >
          Set up authenticator app
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white p-5 text-center ring-1 ring-ink-200">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URI from Supabase, not an optimisable image */}
        <img src={enrollment.qrCode} alt="QR code to add Perqly to your authenticator app" className="mx-auto size-48" />
        <p className="mt-4 text-sm text-ink-600">Can&apos;t scan it? Enter this key in the app instead:</p>
        <p className="mt-1 font-mono text-sm font-semibold break-all text-ink-900 select-all">{enrollment.secret}</p>
      </div>
      <TotpCodeForm factorId={enrollment.factorId} label="6-digit code from the app" />
    </div>
  );
}
