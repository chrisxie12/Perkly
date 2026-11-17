"use client";

import { useActionState, useEffect, useRef } from "react";
import { FieldError, FieldHint, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { createOrganisation } from "../actions";
import { ORG_KINDS } from "../schemas";

export function CreateOrganisationForm({ institutions }: { institutions: { id: string; short_name: string; name: string }[] }) {
  const [state, action] = useActionState(createOrganisation, idleState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state.status]);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="org-school">School</Label>
          <NativeSelect id="org-school" name="institutionId" defaultValue="" invalid={Boolean(e.institutionId)}>
            <option value="" disabled>
              Choose a school
            </option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.short_name}: {i.name}
              </option>
            ))}
          </NativeSelect>
          {e.institutionId && <FieldError>{e.institutionId}</FieldError>}
        </div>
        <div>
          <Label htmlFor="org-kind">Kind</Label>
          <NativeSelect id="org-kind" name="kind" defaultValue="" invalid={Boolean(e.kind)}>
            <option value="" disabled>
              Choose a kind
            </option>
            {ORG_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </NativeSelect>
          {e.kind ? (
            <FieldError>{e.kind}</FieldError>
          ) : (
            <FieldHint>University administration needs a signed agreement with the school first.</FieldHint>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="org-name">Name</Label>
          <Input id="org-name" name="name" maxLength={120} invalid={Boolean(e.name)} />
          {e.name && <FieldError>{e.name}</FieldError>}
        </div>
        <div>
          <Label htmlFor="org-slug">Web name</Label>
          <Input id="org-slug" name="slug" placeholder="src" maxLength={64} invalid={Boolean(e.slug)} />
          {e.slug ? <FieldError>{e.slug}</FieldError> : <FieldHint>Lowercase letters, numbers and hyphens.</FieldHint>}
        </div>
      </div>
      <div>
        <Label htmlFor="org-about">About (optional)</Label>
        <Textarea id="org-about" name="description" rows={3} maxLength={2000} />
      </div>
      <SubmitButton>Create as draft</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
