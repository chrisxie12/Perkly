"use client";

import { useActionState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { recordCodeDownload, reissueCode } from "../actions";

export function PrintPosterButton({ qrCodeId, posterId }: { qrCodeId: string; posterId: string }) {
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={async () => {
        await recordCodeDownload(qrCodeId);
        const poster = document.getElementById(posterId);
        poster?.classList.add("print-me");
        document.body.classList.add("printing-poster");
        window.print();
        document.body.classList.remove("printing-poster");
        poster?.classList.remove("print-me");
      }}
    >
      <Printer aria-hidden /> Print poster
    </Button>
  );
}

export function ReissueForm({ branchId }: { branchId: string }) {
  const [state, action] = useActionState(reissueCode, idleState);
  return (
    <form action={action} noValidate className="space-y-3">
      <input type="hidden" name="branchId" value={branchId} />
      <div>
        <Label htmlFor={`reason-${branchId}`}>Why do you need a new code?</Label>
        <Textarea id={`reason-${branchId}`} name="reason" maxLength={300} invalid={Boolean(state.fieldErrors?.reason)} />
        {state.fieldErrors?.reason && <FieldError>{state.fieldErrors.reason}</FieldError>}
      </div>
      <p className="text-sm text-ink-600">The current code stops working immediately. Redemptions already in progress finish normally.</p>
      <SubmitButton variant="secondary" size="sm">
        Issue a new code
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
