"use client";

import { useActionState, useEffect, useRef } from "react";
import { FieldError, FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState, type FormState } from "@/features/auth/types";

/** Add or change a member by their sign-in email. Used by owners (own organisation) and Perqly admins. */
export function MemberForm({
  organisationId,
  action,
  roles,
  emailHint,
}: {
  organisationId: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  roles: ("owner" | "admin" | "editor")[];
  emailHint: string;
}) {
  const [state, run] = useActionState(action, idleState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state.status]);
  const e = state.fieldErrors ?? {};
  const id = (k: string) => `${k}-${organisationId}`;
  return (
    <form ref={ref} action={run} noValidate className="space-y-4">
      <input type="hidden" name="organisationId" value={organisationId} />
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <div>
          <Label htmlFor={id("email")}>Their Perqly email</Label>
          <Input id={id("email")} name="email" type="email" autoComplete="off" invalid={Boolean(e.email)} />
          {e.email ? <FieldError>{e.email}</FieldError> : <FieldHint>{emailHint}</FieldHint>}
        </div>
        <div>
          <Label htmlFor={id("role")}>Role</Label>
          <NativeSelect id={id("role")} name="role" defaultValue={roles.includes("editor") ? "editor" : roles[0]}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {{ owner: "Owner", admin: "Admin", editor: "Editor" }[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div>
        <Label htmlFor={id("title")}>Title (optional)</Label>
        <Input id={id("title")} name="title" placeholder="For example, General Secretary" maxLength={60} invalid={Boolean(e.title)} />
        {e.title && <FieldError>{e.title}</FieldError>}
      </div>
      <SubmitButton variant="secondary">Add or update</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
