"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { startMerchantPayment, type PayState } from "../actions";

export function PayButton({ merchantId, label }: { merchantId: string; label: string }) {
  const [state, action] = useActionState<PayState, FormData>(startMerchantPayment, { status: "idle" });
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="merchantId" value={merchantId} />
      <SubmitButton>{label}</SubmitButton>
      <p className="text-sm text-ink-600">Mobile money or card, on Paystack&apos;s secure page.</p>
      {state.status === "error" && (
        <p role="alert" className="font-medium text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
