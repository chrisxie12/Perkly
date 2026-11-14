"use client";

import { useActionState } from "react";
import { FieldError, Input, Label } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { saveSetting, setStaffRole } from "../platform-actions";

export function StaffRoleForm() {
  const [state, action] = useActionState(setStaffRole, idleState);
  return (
    <form action={action} noValidate className="space-y-4">
      <div>
        <Label htmlFor="email">Their Perqly email</Label>
        <Input id="email" name="email" type="email" autoComplete="off" invalid={Boolean(state.fieldErrors?.email)} />
        {state.fieldErrors?.email && <FieldError>{state.fieldErrors.email}</FieldError>}
      </div>
      <div>
        <Label htmlFor="role">Role</Label>
        <select id="role" name="role" defaultValue="support" className="w-full rounded-lg bg-white px-3 py-3 ring-1 ring-ink-200">
          <option value="reviewer">Reviewer: reviews students for delegated institutions</option>
          <option value="support">Support: looks up accounts, redemptions and reports</option>
          <option value="admin">Admin: everything except roles and settings</option>
          <option value="super_admin">Super admin: everything</option>
          <option value="none">Remove their role</option>
        </select>
      </div>
      <SubmitButton>Save role</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function SettingForm({ settingKey, value }: { settingKey: string; value: number }) {
  const [state, action] = useActionState(saveSetting, idleState);
  return (
    <form action={action} noValidate className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="key" value={settingKey} />
      <label htmlFor={`v-${settingKey}`} className="sr-only">
        New value
      </label>
      <Input
        id={`v-${settingKey}`}
        name="value"
        inputMode="numeric"
        defaultValue={String(value)}
        className="w-28"
        invalid={Boolean(state.fieldErrors?.value)}
      />
      <SubmitButton size="sm" variant="secondary">
        Save
      </SubmitButton>
      {state.fieldErrors?.value && <FieldError>{state.fieldErrors.value}</FieldError>}
      <FormMessage state={state} />
    </form>
  );
}
