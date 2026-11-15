"use client";

import { HoursEditor } from "./hours-editor";
import type { DayHours } from "../hours";

import { useActionState, useEffect, useRef, useState } from "react";
import { FieldError, FieldHint, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { addTeamMember, registerMerchant, saveBranch, saveMerchantProfile } from "../actions";
import type { BranchRow, MerchantRow } from "../queries";

type Category = { id: string; name: string };

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <FieldHint>{hint}</FieldHint>}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

export function RegisterMerchantForm({ categories }: { categories: Category[] }) {
  const [state, action] = useActionState(registerMerchant, idleState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-5">
      <FormMessage state={state} />
      <Field id="displayName" label="Business name" error={e.displayName} hint="As students will see it, for example Fresh Fade Barbers.">
        <Input id="displayName" name="displayName" invalid={Boolean(e.displayName)} />
      </Field>
      <Field id="categoryId" label="What do you sell?" error={e.categoryId}>
        <NativeSelect id="categoryId" name="categoryId" defaultValue="" invalid={Boolean(e.categoryId)}>
          <option value="">Choose a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="phone" label="Business phone (optional)" error={e.phone}>
          <Input id="phone" name="phone" type="tel" inputMode="tel" placeholder="024 123 4567" invalid={Boolean(e.phone)} />
        </Field>
        <Field id="email" label="Business email (optional)" error={e.email}>
          <Input id="email" name="email" type="email" invalid={Boolean(e.email)} />
        </Field>
      </div>
      <Field id="description" label="About your business (optional)" error={e.description}>
        <Textarea id="description" name="description" invalid={Boolean(e.description)} />
      </Field>
      <p className="text-sm text-ink-600">
        You&apos;ll become the owner. Owners use two-step verification with an authenticator app, so have your phone ready.
      </p>
      <SubmitButton>Register business</SubmitButton>
    </form>
  );
}

export function MerchantProfileForm({
  merchant,
  categories,
  readOnly,
}: {
  merchant: MerchantRow;
  categories: Category[];
  readOnly: boolean;
}) {
  const [state, action] = useActionState(saveMerchantProfile, idleState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="merchantId" value={merchant.id} />
      <fieldset disabled={readOnly} className="space-y-5">
        <Field id="displayName" label="Business name" error={e.displayName}>
          <Input id="displayName" name="displayName" defaultValue={merchant.display_name} invalid={Boolean(e.displayName)} />
        </Field>
        <Field id="categoryId" label="Category" error={e.categoryId}>
          <NativeSelect id="categoryId" name="categoryId" defaultValue={merchant.category_id}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="legalName" label="Registered name (optional)" error={e.legalName} hint="As on your business registration, if different.">
          <Input id="legalName" name="legalName" defaultValue={merchant.legal_name ?? ""} invalid={Boolean(e.legalName)} />
        </Field>
        <Field id="description" label="About your business" error={e.description} hint="What you offer and why students should come.">
          <Textarea id="description" name="description" defaultValue={merchant.description ?? ""} invalid={Boolean(e.description)} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="phone" label="Phone" error={e.phone}>
            <Input id="phone" name="phone" type="tel" defaultValue={merchant.phone ?? ""} invalid={Boolean(e.phone)} />
          </Field>
          <Field id="email" label="Email" error={e.email}>
            <Input id="email" name="email" type="email" defaultValue={merchant.email ?? ""} invalid={Boolean(e.email)} />
          </Field>
        </div>
        <Field id="website" label="Website (optional)" error={e.website}>
          <Input
            id="website"
            name="website"
            type="url"
            placeholder="https://"
            defaultValue={merchant.website ?? ""}
            invalid={Boolean(e.website)}
          />
        </Field>
      </fieldset>
      <FormMessage state={state} />
      {!readOnly && <SubmitButton>Save profile</SubmitButton>}
    </form>
  );
}

export function BranchForm({
  merchantId,
  branch,
  hours,
  readOnly = false,
}: {
  merchantId: string;
  branch?: BranchRow;
  hours?: DayHours[];
  readOnly?: boolean;
}) {
  const [state, action] = useActionState(saveBranch, idleState);
  const e = state.fieldErrors ?? {};
  const id = (name: string) => `${branch?.id ?? "new"}-${name}`;
  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="merchantId" value={merchantId} />
      {branch && <input type="hidden" name="branchId" value={branch.id} />}
      <fieldset disabled={readOnly} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id={id("name")} label="Branch name" error={e.name} hint="Students see this, for example Tesano, opposite GCTU main gate.">
            <Input id={id("name")} name="name" defaultValue={branch?.name} invalid={Boolean(e.name)} />
          </Field>
          <Field id={id("phone")} label="Branch phone (optional)" error={e.phone}>
            <Input id={id("phone")} name="phone" type="tel" defaultValue={branch?.phone ?? ""} invalid={Boolean(e.phone)} />
          </Field>
          <Field id={id("addressLine")} label="Street address" error={e.addressLine}>
            <Input id={id("addressLine")} name="addressLine" defaultValue={branch?.address_line ?? ""} />
          </Field>
          <Field id={id("area")} label="Area" error={e.area}>
            <Input id={id("area")} name="area" defaultValue={branch?.area ?? ""} placeholder="Tesano" />
          </Field>
          <Field id={id("city")} label="City" error={e.city}>
            <Input id={id("city")} name="city" defaultValue={branch?.city ?? "Accra"} />
          </Field>
          <Field id={id("digitalAddress")} label="GhanaPost address (optional)" error={e.digitalAddress}>
            <Input id={id("digitalAddress")} name="digitalAddress" defaultValue={branch?.digital_address ?? ""} placeholder="GA-123-4567" />
          </Field>
          <Field id={id("latitude")} label="Latitude (optional)" error={e.latitude} hint="Helps students find you on a map.">
            <Input id={id("latitude")} name="latitude" inputMode="decimal" defaultValue={branch?.latitude ?? ""} />
          </Field>
          <Field id={id("longitude")} label="Longitude (optional)" error={e.longitude}>
            <Input id={id("longitude")} name="longitude" inputMode="decimal" defaultValue={branch?.longitude ?? ""} />
          </Field>
        </div>
        <HoursEditor initial={hours ?? []} disabled={readOnly} />
        {e.hours && <FieldError>{e.hours}</FieldError>}
        {branch && (
          <Field id={id("isActive")} label="Status">
            <NativeSelect id={id("isActive")} name="isActive" defaultValue={branch.is_active ? "true" : "false"}>
              <option value="true">Open: students can redeem here</option>
              <option value="false">Closed: hidden from students</option>
            </NativeSelect>
          </Field>
        )}
      </fieldset>
      <FormMessage state={state} />
      {!readOnly && <SubmitButton variant={branch ? "secondary" : "primary"}>{branch ? "Save branch" : "Add branch"}</SubmitButton>}
    </form>
  );
}

export function AddTeamMemberForm({
  merchantId,
  branches,
  canAddManager,
}: {
  merchantId: string;
  branches: BranchRow[];
  canAddManager: boolean;
}) {
  const [state, action] = useActionState(addTeamMember, idleState);
  const [role, setRole] = useState<"manager" | "cashier">(canAddManager ? "manager" : "cashier");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state.status]);
  const e = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} noValidate className="space-y-5">
      <input type="hidden" name="merchantId" value={merchantId} />
      <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
        <Field id="member-email" label="Their Perqly email" error={e.email} hint="They need a Perqly account first.">
          <Input id="member-email" name="email" type="email" autoComplete="off" invalid={Boolean(e.email)} />
        </Field>
        <Field id="member-role" label="Role">
          <NativeSelect
            id="member-role"
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as "manager" | "cashier")}
          >
            {canAddManager && <option value="manager">Manager</option>}
            <option value="cashier">Cashier</option>
          </NativeSelect>
        </Field>
      </div>
      {role === "cashier" && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink-900">Branches they work at</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {branches.map((branch) => (
              <label key={branch.id} className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-ink-200">
                <input type="checkbox" name="branchIds" value={branch.id} className="size-4 accent-blue-500" />
                <span className="font-medium text-ink-900">{branch.name}</span>
              </label>
            ))}
          </div>
          {e.branchIds && <FieldError>{e.branchIds}</FieldError>}
        </fieldset>
      )}
      <p className="text-sm text-ink-600">
        {role === "manager"
          ? "Managers can edit the business, branches, catalogue and offers, add cashiers and confirm discounts at every branch."
          : "Cashiers can only confirm student discounts at the branches you choose."}
      </p>
      <SubmitButton variant="secondary">Add to team</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
