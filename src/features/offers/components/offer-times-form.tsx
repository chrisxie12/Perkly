"use client";

import { useActionState } from "react";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { saveOfferRunTimes } from "../actions";
import type { MerchantOffer } from "../queries";
import { RunTimesFields } from "./run-times-fields";

export function OfferTimesForm({ offer }: { offer: MerchantOffer }) {
  const [state, action] = useActionState(saveOfferRunTimes, idleState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-6">
      <input type="hidden" name="offerId" value={offer.id} />
      <FormMessage state={state} />
      <RunTimesFields initial={offer} errors={{ runDays: e.runDays, runUntil: e.runUntil }} />
      <SubmitButton>Save days and times</SubmitButton>
    </form>
  );
}
