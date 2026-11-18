"use client";

import { useActionState } from "react";
import { FieldError, FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { recordAgreement } from "../admin-actions";

export function AgreementForm({
  schools,
  defaultSchool,
}: {
  schools: { institution_id: string; short_name: string; name: string }[];
  defaultSchool?: string;
}) {
  const [state, action] = useActionState(recordAgreement, idleState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-4">
      <div>
        <Label htmlFor="ag-school">School</Label>
        <NativeSelect id="ag-school" name="institutionId" defaultValue={defaultSchool ?? ""} invalid={Boolean(e.institutionId)}>
          <option value="" disabled>
            Choose a school
          </option>
          {schools.map((s) => (
            <option key={s.institution_id} value={s.institution_id}>
              {s.short_name}: {s.name}
            </option>
          ))}
        </NativeSelect>
        {e.institutionId && <FieldError>{e.institutionId}</FieldError>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ag-signed">Signed on</Label>
          <Input id="ag-signed" name="signedOn" type="date" invalid={Boolean(e.signedOn)} />
          {e.signedOn && <FieldError>{e.signedOn}</FieldError>}
        </div>
        <div>
          <Label htmlFor="ag-ends">Ends on (optional)</Label>
          <Input id="ag-ends" name="endsOn" type="date" invalid={Boolean(e.endsOn)} />
          {e.endsOn ? <FieldError>{e.endsOn}</FieldError> : <FieldHint>Leave empty if it doesn&apos;t end on a set date.</FieldHint>}
        </div>
      </div>
      <div>
        <Label htmlFor="ag-name">Signed for the school by</Label>
        <Input id="ag-name" name="signedByName" maxLength={120} placeholder="Name and title" invalid={Boolean(e.signedByName)} />
        {e.signedByName && <FieldError>{e.signedByName}</FieldError>}
      </div>
      <div>
        <Label htmlFor="ag-ref">Where the signed copy is kept</Label>
        <Input
          id="ag-ref"
          name="documentRef"
          maxLength={200}
          placeholder="e.g. Drive › Agreements › GCTU 2026"
          invalid={Boolean(e.documentRef)}
        />
        {e.documentRef ? (
          <FieldError>{e.documentRef}</FieldError>
        ) : (
          <FieldHint>A reference only. Don&apos;t paste the document or any personal details.</FieldHint>
        )}
      </div>
      <SubmitButton>Record agreement</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
