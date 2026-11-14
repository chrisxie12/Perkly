"use client";

import { useActionState, useState } from "react";
import { FieldError, FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { saveStudentProfile } from "../actions";
import { LEVELS } from "../schemas";
import type { CampusOption, InstitutionOption } from "../queries";

type Initial = {
  institutionId?: string;
  campusId?: string | null;
  programme?: string | null;
  level?: string | null;
  gradYear?: number | null;
};

export function StudentProfileForm({
  institutions,
  campuses,
  initial,
  institutionLocked,
  currentYear,
}: {
  institutions: InstitutionOption[];
  campuses: CampusOption[];
  initial: Initial;
  institutionLocked: boolean;
  currentYear: number;
}) {
  const [state, action] = useActionState(saveStudentProfile, idleState);
  const [institutionId, setInstitutionId] = useState(initial.institutionId ?? (institutions.length === 1 ? institutions[0].id : ""));
  const schoolCampuses = campuses.filter((campus) => campus.institution_id === institutionId);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className="space-y-6">
      <div>
        <Label htmlFor="institutionId">School</Label>
        {institutionLocked && <input type="hidden" name="institutionId" value={institutionId} />}
        <NativeSelect
          id="institutionId"
          name={institutionLocked ? undefined : "institutionId"}
          value={institutionId}
          onChange={(event) => setInstitutionId(event.target.value)}
          disabled={institutionLocked}
          invalid={Boolean(errors.institutionId)}
          aria-describedby={errors.institutionId ? "institutionId-error" : institutionLocked ? "institutionId-hint" : undefined}
        >
          <option value="">Choose your school</option>
          {institutions.map((institution) => (
            <option key={institution.id} value={institution.id}>
              {institution.name} ({institution.short_name})
            </option>
          ))}
        </NativeSelect>
        {errors.institutionId && <FieldError id="institutionId-error">{errors.institutionId}</FieldError>}
        {institutionLocked && (
          <FieldHint id="institutionId-hint">Your school can&apos;t change while an application is open or you&apos;re verified.</FieldHint>
        )}
      </div>

      {schoolCampuses.length > 0 && (
        <div>
          <Label htmlFor="campusId">Campus</Label>
          <NativeSelect id="campusId" name="campusId" defaultValue={initial.campusId ?? ""}>
            <option value="">Not sure / other</option>
            {schoolCampuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div>
        <Label htmlFor="programme">Programme</Label>
        <Input
          id="programme"
          name="programme"
          defaultValue={initial.programme ?? ""}
          placeholder="e.g. BSc Computer Science"
          invalid={Boolean(errors.programme)}
        />
        {errors.programme && <FieldError>{errors.programme}</FieldError>}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="level">Level</Label>
          <NativeSelect id="level" name="level" defaultValue={initial.level ?? ""}>
            <option value="">Choose</option>
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="gradYear">Expected graduation year</Label>
          <NativeSelect id="gradYear" name="gradYear" defaultValue={initial.gradYear?.toString() ?? ""}>
            <option value="">Choose</option>
            {Array.from({ length: 8 }, (_, i) => currentYear + i).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <FormMessage state={state} />
      <SubmitButton>Save school details</SubmitButton>
    </form>
  );
}
