"use client";

import { useActionState, useState } from "react";
import { FieldError, FieldHint, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { saveResource } from "../actions";
import { AVAILABILITY, CATEGORIES, OFFER_TYPES, slugify, type Resource } from "../model";

const CHECKS = [
  ["needsSchoolEmail", "needs_school_email", "Needs a school email address"],
  ["needsStudentProof", "needs_student_proof", "Needs proof of student status (ID card, enrolment letter)"],
  ["needsInstitutionListed", "needs_institution_listed", "The school must be recognised by the provider"],
  ["needsPaymentCard", "needs_payment_card", "Needs a payment card or payment method"],
] as const;

/** Create or edit a resource. Saving never publishes: approval is a separate step. */
export function ResourceForm({ resource }: { resource?: Resource }) {
  const [state, action] = useActionState(saveResource, idleState);
  const e = state.fieldErrors ?? {};
  const [slug, setSlug] = useState(resource?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(resource));
  const field = (name: string, label: string, input: React.ReactNode, hint?: string) => (
    <div>
      <Label htmlFor={name}>{label}</Label>
      {input}
      {hint && !e[name] && <FieldHint>{hint}</FieldHint>}
      {e[name] && <FieldError id={`${name}-error`}>{e[name]}</FieldError>}
    </div>
  );
  return (
    <form action={action} noValidate className="max-w-3xl space-y-6">
      {resource && <input type="hidden" name="id" value={resource.id} />}
      <div className="grid gap-5 sm:grid-cols-2">
        {field(
          "name",
          "Name",
          <Input
            id="name"
            name="name"
            defaultValue={resource?.name}
            invalid={Boolean(e.name)}
            onChange={(ev) => {
              if (!slugTouched) setSlug(slugify(ev.target.value));
            }}
          />,
        )}
        {field(
          "provider",
          "Provider",
          <Input id="provider" name="provider" defaultValue={resource?.provider} invalid={Boolean(e.provider)} />,
        )}
        {field(
          "slug",
          "Web address",
          <Input
            id="slug"
            name="slug"
            value={slug}
            invalid={Boolean(e.slug)}
            onChange={(ev) => {
              setSlugTouched(true);
              setSlug(ev.target.value);
            }}
          />,
          `perqly.online/student/resources/${slug || "…"}`,
        )}
        {field(
          "category",
          "Category",
          <NativeSelect id="category" name="category" defaultValue={resource?.category ?? ""} invalid={Boolean(e.category)}>
            <option value="" disabled>
              Choose…
            </option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>,
        )}
        {field(
          "offerType",
          "Offer type",
          <NativeSelect id="offerType" name="offerType" defaultValue={resource?.offer_type ?? ""} invalid={Boolean(e.offerType)}>
            <option value="" disabled>
              Choose…
            </option>
            {Object.entries(OFFER_TYPES).map(([value, o]) => (
              <option key={value} value={value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>,
          "Free forever, free for students, free trial, student discount, paid exam, funded or loan.",
        )}
        {field(
          "offerLabel",
          "Offer label (optional)",
          <Input id="offerLabel" name="offerLabel" defaultValue={resource?.offer_label ?? ""} invalid={Boolean(e.offerLabel)} />,
          "Short and specific, like “$100 Azure credit”. Shown instead of the offer type.",
        )}
      </div>

      {field(
        "summary",
        "One-line summary",
        <Input id="summary" name="summary" defaultValue={resource?.summary} invalid={Boolean(e.summary)} />,
      )}
      {field(
        "description",
        "Description (optional)",
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={resource?.description ?? ""}
          invalid={Boolean(e.description)}
        />,
      )}
      {field(
        "benefits",
        "What students get",
        <Textarea
          id="benefits"
          name="benefits"
          rows={4}
          defaultValue={resource?.benefits.join("\n") ?? ""}
          invalid={Boolean(e.benefits)}
        />,
        "One benefit per line, up to 8.",
      )}

      <fieldset className="space-y-2.5">
        <legend className="mb-2 text-sm font-semibold text-ink-900">Requirements</legend>
        {CHECKS.map(([name, key, label]) => (
          <label key={name} className="flex items-start gap-2.5 text-[0.9375rem]">
            <input type="checkbox" name={name} defaultChecked={Boolean(resource?.[key])} className="mt-1 size-4 accent-blue-600" />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        {field(
          "minAge",
          "Minimum age (optional)",
          <Input id="minAge" name="minAge" inputMode="numeric" defaultValue={resource?.min_age ?? ""} invalid={Boolean(e.minAge)} />,
        )}
        {field(
          "availability",
          "Availability",
          <NativeSelect id="availability" name="availability" defaultValue={resource?.availability ?? "needs_verification"}>
            {Object.entries(AVAILABILITY).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>,
          "Don't mark it available in Ghana just because the website opens here.",
        )}
      </div>
      {field(
        "requirementsNote",
        "Requirements in detail (optional)",
        <Textarea id="requirementsNote" name="requirementsNote" rows={3} defaultValue={resource?.requirements_note ?? ""} />,
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {field(
          "officialUrl",
          "Official sign-up link",
          <Input id="officialUrl" name="officialUrl" type="url" defaultValue={resource?.official_url} invalid={Boolean(e.officialUrl)} />,
          "The provider's own page, https:// only.",
        )}
        {field(
          "sourceUrl",
          "Source you checked (optional)",
          <Input id="sourceUrl" name="sourceUrl" type="url" defaultValue={resource?.source_url ?? ""} invalid={Boolean(e.sourceUrl)} />,
        )}
        {field(
          "eligibility",
          "Eligibility",
          <NativeSelect id="eligibility" name="eligibility" defaultValue={resource?.eligibility ?? "needs_verification"}>
            <option value="needs_verification">Needs verification</option>
            <option value="confirmed">Confirmed</option>
          </NativeSelect>,
          "Only confirm what you've checked on an official source.",
        )}
        {field(
          "checkedOn",
          "Date checked",
          <Input id="checkedOn" name="checkedOn" type="date" defaultValue={resource?.checked_on ?? ""} invalid={Boolean(e.checkedOn)} />,
        )}
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton>{resource ? "Save changes" : "Save as draft"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
