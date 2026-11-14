"use client";

import { useActionState } from "react";
import { FieldError, Input, Label } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { signAgreement } from "../actions";

export function SignAgreementForm({
  merchantId,
  version,
  legalName,
  signerName,
}: {
  merchantId: string;
  version: number;
  legalName: string;
  signerName: string;
}) {
  const [state, action] = useActionState(signAgreement, idleState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="version" value={version} />
      <div>
        <Label htmlFor="businessLegalName">Business&apos;s registered name</Label>
        <Input id="businessLegalName" name="businessLegalName" defaultValue={legalName} invalid={Boolean(e.businessLegalName)} />
        {e.businessLegalName && <FieldError>{e.businessLegalName}</FieldError>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="signerName">Your full name (your signature)</Label>
          <Input id="signerName" name="signerName" defaultValue={signerName} autoComplete="name" invalid={Boolean(e.signerName)} />
          {e.signerName && <FieldError>{e.signerName}</FieldError>}
        </div>
        <div>
          <Label htmlFor="signerRole">Your role</Label>
          <Input id="signerRole" name="signerRole" defaultValue="Owner" invalid={Boolean(e.signerRole)} />
          {e.signerRole && <FieldError>{e.signerRole}</FieldError>}
        </div>
      </div>
      <label className="flex items-start gap-3 rounded-lg bg-ink-50 p-4 text-ink-900">
        <input type="checkbox" name="accept" value="yes" className="mt-1 size-4 accent-blue-500" />
        <span>I have read this agreement, I agree to it for the business named above, and I&apos;m authorised to sign for it.</span>
      </label>
      {e.accept && <FieldError>{e.accept}</FieldError>}
      <SubmitButton>Sign agreement</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
