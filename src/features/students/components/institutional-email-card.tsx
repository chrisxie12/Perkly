"use client";

import { useActionState } from "react";
import { BadgeCheck, CircleDashed } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { confirmInstitutionalEmailCode, saveInstitutionalEmail, sendInstitutionalEmailCode } from "../actions";

export function InstitutionalEmailCard({
  email,
  confirmed,
  confirmationEnabled,
}: {
  email: string | null;
  confirmed: boolean;
  confirmationEnabled: boolean;
}) {
  const [saveState, saveAction] = useActionState(saveInstitutionalEmail, idleState);
  const [sendState, sendAction, sending] = useActionState(sendInstitutionalEmailCode, idleState);
  const [codeState, codeAction] = useActionState(confirmInstitutionalEmailCode, idleState);

  return (
    <Card>
      <CardTitle>Institutional email (optional)</CardTitle>
      <CardDescription>
        If you have a school email, you can add it here and include it with your verification application. You don&apos;t need one: you sign
        in with your personal email, and your school&apos;s reviewers verify you from your student ID.
      </CardDescription>

      {email && (
        <p className="mt-5 flex flex-wrap items-center gap-2 text-[0.9375rem]">
          <span className="font-semibold text-ink-900">{email}</span>
          {confirmed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-success">
              <BadgeCheck className="size-3.5" aria-hidden /> Confirmed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-700">
              <CircleDashed className="size-3.5" aria-hidden /> Not confirmed
            </span>
          )}
        </p>
      )}

      <form action={saveAction} noValidate className="mt-5 space-y-4">
        <div>
          <Label htmlFor="institutionalEmail">{email ? "Change institutional email" : "Institutional email"}</Label>
          <Input
            id="institutionalEmail"
            name="institutionalEmail"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={email ?? ""}
            invalid={Boolean(saveState.fieldErrors?.institutionalEmail)}
            aria-describedby={saveState.fieldErrors?.institutionalEmail ? "institutionalEmail-error" : undefined}
          />
          {saveState.fieldErrors?.institutionalEmail && (
            <FieldError id="institutionalEmail-error">{saveState.fieldErrors.institutionalEmail}</FieldError>
          )}
        </div>
        <FormMessage state={saveState} />
        <SubmitButton variant="secondary">Save</SubmitButton>
      </form>
      {email && (
        <form action={saveAction} className="mt-2">
          <input type="hidden" name="institutionalEmail" value="" />
          <Button type="submit" variant="ghost" size="sm">
            Remove institutional email
          </Button>
        </form>
      )}

      {email && !confirmed && confirmationEnabled && (
        <div className="mt-6 space-y-4 border-t border-ink-200 pt-5">
          <p className="text-[0.9375rem] text-ink-700">
            Confirm it&apos;s yours with a 6-digit code. Confirming helps your reviewer, but doesn&apos;t verify you on its own.
          </p>
          <form action={sendAction}>
            <Button type="submit" variant="secondary" loading={sending}>
              Send code to {email}
            </Button>
          </form>
          <FormMessage state={sendState} />
          <form action={codeAction} noValidate className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="institutionalCode">Code</Label>
              <Input
                id="institutionalCode"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                className="w-40"
                invalid={Boolean(codeState.fieldErrors?.code)}
              />
            </div>
            <SubmitButton variant="secondary">Confirm</SubmitButton>
          </form>
          {codeState.fieldErrors?.code && <FieldError>{codeState.fieldErrors.code}</FieldError>}
          <FormMessage state={codeState} />
        </div>
      )}
      {email && !confirmed && !confirmationEnabled && (
        <p className="mt-6 border-t border-ink-200 pt-5 text-sm text-ink-600">
          Email confirmation isn&apos;t switched on yet. Your reviewer will see this address as not confirmed, which doesn&apos;t affect
          your application.
        </p>
      )}
    </Card>
  );
}
