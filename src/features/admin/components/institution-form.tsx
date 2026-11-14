"use client";

import { useActionState, useState } from "react";
import { FieldError, FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { saveInstitution } from "../actions";
import type { InstitutionRow } from "../queries";

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function InstitutionForm({ institution }: { institution?: InstitutionRow }) {
  const [state, action] = useActionState(saveInstitution, idleState);
  const [reviewMode, setReviewMode] = useState(institution?.review_mode ?? "institution");
  const errors = state.fieldErrors ?? {};
  const isNew = !institution;

  return (
    <form action={action} noValidate className="space-y-5">
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={institution?.name}
            placeholder="Ghana Communication Technology University"
            invalid={Boolean(errors.name)}
          />
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </div>
        <div>
          <Label htmlFor="shortName">Short name</Label>
          <Input
            id="shortName"
            name="shortName"
            defaultValue={institution?.short_name}
            placeholder="GCTU"
            invalid={Boolean(errors.shortName)}
          />
          <FieldHint>What students see on their pass.</FieldHint>
          {errors.shortName && <FieldError>{errors.shortName}</FieldError>}
        </div>
        <div>
          <Label htmlFor="slug">Web name</Label>
          {isNew ? (
            <Input id="slug" name="slug" placeholder="gctu" invalid={Boolean(errors.slug)} autoCapitalize="none" />
          ) : (
            <>
              <Input id="slug" value={institution.slug} disabled readOnly />
              <input type="hidden" name="slug" value={institution.slug} />
            </>
          )}
          <FieldHint>{isNew ? "Lowercase letters, numbers and hyphens. It can't be changed later." : "Can't be changed."}</FieldHint>
          {errors.slug && <FieldError>{errors.slug}</FieldError>}
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <NativeSelect id="status" name="status" defaultValue={institution?.status ?? "inactive"} invalid={Boolean(errors.status)}>
            <option value="inactive">Hidden: students can&apos;t choose it</option>
            <option value="pilot">Pilot: open to students</option>
            <option value="active">Active: open to students</option>
          </NativeSelect>
          {errors.status && <FieldError>{errors.status}</FieldError>}
        </div>
        <div>
          <Label htmlFor="reviewMode">Who reviews students</Label>
          <NativeSelect
            id="reviewMode"
            name="reviewMode"
            value={reviewMode}
            onChange={(event) => setReviewMode(event.target.value as typeof reviewMode)}
          >
            <option value="institution">The institution&apos;s own reviewers</option>
            <option value="delegated">Perqly, under a signed agreement</option>
          </NativeSelect>
          {errors.reviewMode && <FieldError>{errors.reviewMode}</FieldError>}
        </div>
        {reviewMode === "delegated" && (
          <div>
            <Label htmlFor="delegatedAt">Agreement signed on</Label>
            <Input
              id="delegatedAt"
              name="delegatedAt"
              type="date"
              defaultValue={institution?.review_delegated_at ?? undefined}
              invalid={Boolean(errors.delegatedAt)}
            />
            {errors.delegatedAt && <FieldError>{errors.delegatedAt}</FieldError>}
          </div>
        )}
      </div>
      <fieldset>
        <legend className="mb-2 block text-sm font-semibold text-ink-900">Academic year ends on</legend>
        <div className="grid max-w-md grid-cols-[1fr_6rem] gap-3">
          <NativeSelect name="yearEndMonth" aria-label="Month" defaultValue={institution?.academic_year_end_month ?? ""}>
            <option value="">Not set</option>
            {months.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </NativeSelect>
          <Input
            name="yearEndDay"
            aria-label="Day"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            defaultValue={institution?.academic_year_end_day ?? undefined}
            invalid={Boolean(errors.yearEndDay)}
          />
        </div>
        <FieldHint>Verification lasts until this date. If it isn&apos;t set, verification lasts one year.</FieldHint>
        {errors.yearEndDay && <FieldError>{errors.yearEndDay}</FieldError>}
      </fieldset>
      <SubmitButton>{isNew ? "Add institution" : "Save changes"}</SubmitButton>
    </form>
  );
}
