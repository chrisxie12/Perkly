"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { FieldError, FieldHint, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { saveCatalogueItem, saveOffer } from "../actions";
import { discountLabel, money, previewPrice, type DiscountType } from "../schemas";
import type { CatalogueItem, MerchantOffer } from "../queries";

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

export function CatalogueItemForm({
  merchantId,
  item,
  readOnly = false,
}: {
  merchantId: string;
  item?: CatalogueItem;
  readOnly?: boolean;
}) {
  const [state, action] = useActionState(saveCatalogueItem, idleState);
  const [kind, setKind] = useState<"service" | "product">(item?.kind ?? "service");
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success" && !item) ref.current?.reset();
  }, [state.status, item]);
  const e = state.fieldErrors ?? {};
  const id = (name: string) => `${item?.id ?? "new"}-${name}`;
  return (
    <form ref={ref} action={action} noValidate className="space-y-5">
      <input type="hidden" name="merchantId" value={merchantId} />
      {item && <input type="hidden" name="itemId" value={item.id} />}
      {item && <input type="hidden" name="kind" value={item.kind} />}
      <fieldset disabled={readOnly} className="space-y-5">
        {!item && (
          <Field id={id("kind")} label="Type">
            <NativeSelect
              id={id("kind")}
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as "service" | "product")}
            >
              <option value="service">Service (something you do, like a haircut)</option>
              <option value="product">Product (something you sell, like a meal)</option>
            </NativeSelect>
          </Field>
        )}
        <div className="grid gap-5 sm:grid-cols-[1fr_10rem]">
          <Field id={id("name")} label="Name" error={e.name}>
            <Input id={id("name")} name="name" defaultValue={item?.name} invalid={Boolean(e.name)} />
          </Field>
          <Field id={id("regularPrice")} label="Regular price (GH₵)" error={e.regularPrice}>
            <Input
              id={id("regularPrice")}
              name="regularPrice"
              inputMode="decimal"
              defaultValue={item?.regular_price ?? ""}
              invalid={Boolean(e.regularPrice)}
            />
          </Field>
        </div>
        <Field id={id("description")} label="Description (optional)" error={e.description}>
          <Textarea id={id("description")} name="description" defaultValue={item?.description ?? ""} className="min-h-20" />
        </Field>
        {kind === "service" ? (
          <Field id={id("durationMinutes")} label="Takes about (minutes, optional)" error={e.durationMinutes}>
            <Input
              id={id("durationMinutes")}
              name="durationMinutes"
              inputMode="numeric"
              defaultValue={item?.duration_minutes ?? ""}
              className="max-w-40"
            />
          </Field>
        ) : (
          <Field id={id("sku")} label="Your product code (optional)" error={e.sku}>
            <Input id={id("sku")} name="sku" defaultValue={item?.sku ?? ""} className="max-w-60" />
          </Field>
        )}
        {item && (
          <Field id={id("isActive")} label="Availability">
            <NativeSelect id={id("isActive")} name="isActive" defaultValue={item.is_active ? "true" : "false"}>
              <option value="true">Available</option>
              <option value="false">Unavailable: offers on it are hidden</option>
            </NativeSelect>
          </Field>
        )}
      </fieldset>
      <FormMessage state={state} />
      {!readOnly && <SubmitButton variant={item ? "secondary" : "primary"}>{item ? "Save item" : "Add item"}</SubmitButton>}
    </form>
  );
}

type Branch = { id: string; name: string; is_active: boolean };
type School = { id: string; short_name: string };

export function OfferForm({
  merchantId,
  catalogue,
  branches,
  schools,
  offer,
}: {
  merchantId: string;
  catalogue: CatalogueItem[];
  branches: Branch[];
  schools: School[];
  offer?: MerchantOffer;
}) {
  const [state, action] = useActionState(saveOffer, idleState);
  const e = state.fieldErrors ?? {};
  const initialItem = offer ? (offer.service_id ? `service:${offer.service_id}` : `product:${offer.product_id}`) : "";
  const [item, setItem] = useState(initialItem);
  const [type, setType] = useState<DiscountType>(offer?.discount_type ?? "percentage");
  const [value, setValue] = useState(offer ? String(offer.discount_value) : "");
  const selected = catalogue.find((c) => `${c.kind}:${c.id}` === item);
  const preview = useMemo(
    () => (selected ? previewPrice(Number(selected.regular_price), type, Number(value)) : null),
    [selected, type, value],
  );
  const chosenBranches = new Set(offer?.offer_branches.map((b) => b.branch_id) ?? []);
  const chosenSchools = new Set(offer?.offer_institutions.map((i) => i.institution_id) ?? []);
  const local = (iso?: string | null) => (iso ? iso.slice(0, 16) : "");

  return (
    <form action={action} noValidate className="space-y-6">
      <input type="hidden" name="merchantId" value={merchantId} />
      {offer && <input type="hidden" name="offerId" value={offer.id} />}
      <FormMessage state={state} />

      <Field id="item" label="What is discounted?" error={e.item} hint="Add items in your catalogue first.">
        <NativeSelect id="item" name="item" value={item} onChange={(event) => setItem(event.target.value)} invalid={Boolean(e.item)}>
          <option value="">Choose an item</option>
          {catalogue
            .filter((c) => c.is_active || `${c.kind}:${c.id}` === initialItem)
            .map((c) => (
              <option key={c.id} value={`${c.kind}:${c.id}`}>
                {c.name} ({money(c.regular_price)})
              </option>
            ))}
        </NativeSelect>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="discountType" label="Discount">
          <NativeSelect
            id="discountType"
            name="discountType"
            value={type}
            onChange={(event) => setType(event.target.value as DiscountType)}
          >
            <option value="percentage">Percentage off</option>
            <option value="fixed_amount">Amount off (GH₵)</option>
            <option value="fixed_price">Fixed student price (GH₵)</option>
          </NativeSelect>
        </Field>
        <Field
          id="discountValue"
          label={type === "percentage" ? "Percent (1 to 90)" : type === "fixed_amount" ? "GH₵ off" : "Student price (GH₵)"}
          error={e.discountValue}
        >
          <Input
            id="discountValue"
            name="discountValue"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            invalid={Boolean(e.discountValue)}
          />
        </Field>
      </div>

      <div aria-live="polite" className="rounded-xl bg-ink-50 p-4 text-[0.9375rem]">
        {selected && preview ? (
          <p className="text-ink-900">
            Students pay <strong>{money(preview.final)}</strong> instead of {money(preview.regular)} ({discountLabel(type, Number(value))},
            saving {money(preview.discount)}).
            <span className="mt-1 block text-sm text-ink-600">Preview. Perqly calculates the final price when a student redeems.</span>
          </p>
        ) : (
          <p className="text-ink-600">Choose an item and a discount to see what students pay.</p>
        )}
      </div>

      <Field
        id="conditions"
        label="Conditions students must meet"
        error={e.conditions}
        hint="For example: Show your Perqly pass before paying. Not with other promotions."
      >
        <Textarea
          id="conditions"
          name="conditions"
          defaultValue={offer?.conditions ?? ""}
          invalid={Boolean(e.conditions)}
          className="min-h-20"
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="title" label="Headline (optional)" error={e.title} hint="Defaults to the item's name.">
          <Input id="title" name="title" defaultValue={offer?.title ?? ""} />
        </Field>
        <Field id="description" label="Extra detail (optional)" error={e.description}>
          <Input id="description" name="description" defaultValue={offer?.description ?? ""} />
        </Field>
        <Field id="startsAt" label="Starts (optional)" error={e.startsAt} hint="Leave empty to start when it goes live.">
          <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={local(offer?.starts_at)} />
        </Field>
        <Field id="endsAt" label="Ends (optional)" error={e.endsAt}>
          <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={local(offer?.ends_at)} />
        </Field>
        <Field id="perStudentLimit" label="Uses per student" error={e.perStudentLimit}>
          <Input id="perStudentLimit" name="perStudentLimit" inputMode="numeric" defaultValue={offer?.per_student_limit ?? 1} />
        </Field>
        <Field id="perStudentPeriod" label="Per">
          <NativeSelect id="perStudentPeriod" name="perStudentPeriod" defaultValue={offer?.per_student_period ?? "month"}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="offer_lifetime">Whole offer</option>
          </NativeSelect>
        </Field>
        <Field
          id="totalCap"
          label="Total uses across all students (optional)"
          error={e.totalCap}
          hint="The offer ends when this is reached."
        >
          <Input id="totalCap" name="totalCap" inputMode="numeric" defaultValue={offer?.total_cap ?? ""} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-900">Branches</legend>
        <p className="mb-3 text-sm text-ink-600">Leave all unticked to offer it at every branch.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {branches.map((b) => (
            <label key={b.id} className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-ink-200">
              <input
                type="checkbox"
                name="branchIds"
                value={b.id}
                defaultChecked={chosenBranches.has(b.id)}
                className="size-4 accent-blue-500"
              />
              <span className="font-medium text-ink-900">{b.name}</span>
              {!b.is_active && <span className="text-sm text-ink-600">(closed)</span>}
            </label>
          ))}
        </div>
      </fieldset>

      {schools.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink-900">Schools</legend>
          <p className="mb-3 text-sm text-ink-600">Leave all unticked to offer it to verified students of every school.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {schools.map((s) => (
              <label key={s.id} className="flex items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-ink-200">
                <input
                  type="checkbox"
                  name="institutionIds"
                  value={s.id}
                  defaultChecked={chosenSchools.has(s.id)}
                  className="size-4 accent-blue-500"
                />
                <span className="font-medium text-ink-900">{s.short_name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <SubmitButton>{offer ? "Save changes" : "Save as draft"}</SubmitButton>
      <p className="text-sm text-ink-600">Saving keeps it as a draft. Submit it from your offers list when you&apos;re ready.</p>
    </form>
  );
}
