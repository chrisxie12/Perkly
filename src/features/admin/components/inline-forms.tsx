"use client";

import { useActionState, useEffect, useRef } from "react";
import { FieldError, Input, Label, NativeSelect } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { addDomain, appointReviewer, saveCampus } from "../actions";

/** Clears the form after a successful save so the next entry starts empty. */
function useResetOnSuccess(status: string) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (status === "success") ref.current?.reset();
  }, [status]);
  return ref;
}

export function AddDomainForm({ institutionId }: { institutionId: string }) {
  const [state, action] = useActionState(addDomain, idleState);
  const ref = useResetOnSuccess(state.status);
  return (
    <form ref={ref} action={action} noValidate className="space-y-3">
      <input type="hidden" name="institutionId" value={institutionId} />
      <Label htmlFor="domain">Add a domain</Label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input id="domain" name="domain" placeholder="st.gctu.edu.gh" autoCapitalize="none" invalid={Boolean(state.fieldErrors?.domain)} />
        <SubmitButton variant="secondary" className="shrink-0">
          Add domain
        </SubmitButton>
      </div>
      {state.fieldErrors?.domain && <FieldError>{state.fieldErrors.domain}</FieldError>}
      <FormMessage state={state} />
    </form>
  );
}

export function AddCampusForm({ institutionId }: { institutionId: string }) {
  const [state, action] = useActionState(saveCampus, idleState);
  const ref = useResetOnSuccess(state.status);
  const errors = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} noValidate className="space-y-4">
      <input type="hidden" name="institutionId" value={institutionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="campus-name">Campus name</Label>
          <Input id="campus-name" name="name" placeholder="Tesano Campus" invalid={Boolean(errors.name)} />
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </div>
        <div>
          <Label htmlFor="campus-address">GhanaPost address (optional)</Label>
          <Input
            id="campus-address"
            name="digitalAddress"
            placeholder="GA-123-4567"
            autoCapitalize="characters"
            invalid={Boolean(errors.digitalAddress)}
          />
          {errors.digitalAddress && <FieldError>{errors.digitalAddress}</FieldError>}
        </div>
        <div>
          <Label htmlFor="campus-lat">Latitude (optional)</Label>
          <Input id="campus-lat" name="latitude" inputMode="decimal" placeholder="5.6145" invalid={Boolean(errors.latitude)} />
          {errors.latitude && <FieldError>{errors.latitude}</FieldError>}
        </div>
        <div>
          <Label htmlFor="campus-lng">Longitude (optional)</Label>
          <Input id="campus-lng" name="longitude" inputMode="decimal" placeholder="-0.2310" invalid={Boolean(errors.longitude)} />
          {errors.longitude && <FieldError>{errors.longitude}</FieldError>}
        </div>
      </div>
      <SubmitButton variant="secondary">Add campus</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function AppointForm({ institutionId }: { institutionId: string }) {
  const [state, action] = useActionState(appointReviewer, idleState);
  const ref = useResetOnSuccess(state.status);
  const errors = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} noValidate className="space-y-4">
      <input type="hidden" name="institutionId" value={institutionId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <div>
          <Label htmlFor="appoint-email">Their Perqly email</Label>
          <Input
            id="appoint-email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="registrar@gctu.edu.gh"
            invalid={Boolean(errors.email)}
          />
          {errors.email && <FieldError>{errors.email}</FieldError>}
        </div>
        <div>
          <Label htmlFor="appoint-role">Role</Label>
          <NativeSelect id="appoint-role" name="role" defaultValue="reviewer">
            <option value="reviewer">Reviewer</option>
            <option value="admin">Institution admin</option>
          </NativeSelect>
        </div>
      </div>
      <p className="text-sm text-ink-600">
        They need a Perqly account first. Institution admins must set up two-factor sign-in and can appoint reviewers themselves.
      </p>
      <SubmitButton variant="secondary">Appoint</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
