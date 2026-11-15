"use client";

import { useActionState } from "react";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { recordManualPayment, saveBillingSettings } from "../actions";

export function BillingSettingsForm({
  enabled,
  feeGhs,
  trialDays,
  graceDays,
}: {
  enabled: boolean;
  feeGhs: number;
  trialDays: number;
  graceDays: number;
}) {
  const [state, action] = useActionState(saveBillingSettings, idleState);
  return (
    <form action={action} className="space-y-4">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-1 size-5 accent-blue-600" />
        <span>
          <span className="block font-semibold text-ink-900">Charge businesses</span>
          <span className="text-sm text-ink-600">
            Off: everyone uses Perqly free (the pilot). On: each approved business gets its free month from today, then pays monthly.
          </span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="feeGhs">Monthly fee (GH₵)</Label>
          <Input id="feeGhs" name="feeGhs" type="number" inputMode="decimal" min={0} max={100000} step="0.01" defaultValue={feeGhs || ""} />
        </div>
        <div>
          <Label htmlFor="trialDays">Free days for new businesses</Label>
          <Input id="trialDays" name="trialDays" type="number" inputMode="numeric" min={0} max={365} defaultValue={trialDays} />
        </div>
        <div>
          <Label htmlFor="graceDays">Days to pay before deals pause</Label>
          <Input id="graceDays" name="graceDays" type="number" inputMode="numeric" min={0} max={60} defaultValue={graceDays} />
        </div>
      </div>
      <FieldHint>Changes apply straight away and are logged. Switching off puts every paused deal back.</FieldHint>
      <FormMessage state={state} />
      <SubmitButton variant="secondary">Save billing</SubmitButton>
    </form>
  );
}

export function ManualPaymentForm({ merchantId, feeGhs }: { merchantId: string; feeGhs: number }) {
  const [state, action] = useActionState(recordManualPayment, idleState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="merchantId" value={merchantId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="months">Months paid for</Label>
          <Input id="months" name="months" type="number" inputMode="numeric" min={1} max={12} defaultValue={1} />
        </div>
        <div>
          <Label htmlFor="amountGhs">Amount received (GH₵)</Label>
          <Input id="amountGhs" name="amountGhs" type="number" inputMode="decimal" min={0.01} step="0.01" defaultValue={feeGhs || ""} />
        </div>
      </div>
      <div>
        <Label htmlFor="note">How they paid</Label>
        <Input id="note" name="note" maxLength={300} placeholder="e.g. Cash at the office, MoMo to the Perqly number" />
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="md">
        Record payment
      </SubmitButton>
    </form>
  );
}
