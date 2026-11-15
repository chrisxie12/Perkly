"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { createClient } from "@/lib/supabase/client";
import { addShopPhoto, editShopPhoto, saveBranchLocation, saveShopDetails } from "../actions";
import { AMENITIES, MAX_PHOTOS, PAYMENT_METHODS, SOCIALS } from "../shop";
import type { BranchLocation, ShopExtras, ShopPhoto } from "../queries";

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

function Chips({
  name,
  options,
  selected,
  disabled,
}: {
  name: string;
  options: readonly string[];
  selected: string[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o}
          className="cursor-pointer rounded-full border border-ink-200 bg-white px-3.5 py-2 text-[0.9375rem] font-medium text-ink-800 has-checked:border-blue-600 has-checked:bg-blue-50 has-checked:text-blue-800 has-focus-visible:ring-2 has-focus-visible:ring-blue-500"
        >
          <input type="checkbox" name={name} value={o} defaultChecked={selected.includes(o)} disabled={disabled} className="sr-only" />
          {o}
        </label>
      ))}
    </div>
  );
}

export function ShopDetailsForm({
  merchantId,
  phone,
  extras,
  readOnly,
}: {
  merchantId: string;
  phone: string | null;
  extras: ShopExtras;
  readOnly: boolean;
}) {
  const [state, action] = useActionState(saveShopDetails, idleState);
  const e = state.fieldErrors ?? {};
  const [same, setSame] = useState(Boolean(phone && extras.whatsapp && phone.replace(/\D/g, "") === extras.whatsapp.replace(/\D/g, "")));
  return (
    <form action={action} noValidate className="space-y-6">
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="phone" value={phone ?? ""} />
      <fieldset disabled={readOnly} className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="priceRange" label="Price range (optional)" error={e.priceRange} hint="What most things cost, for example GH₵ 20–60.">
            <Input id="priceRange" name="priceRange" defaultValue={extras.price_range ?? ""} invalid={Boolean(e.priceRange)} />
          </Field>
          <div>
            <Field id="whatsapp" label="WhatsApp (optional)" error={e.whatsapp}>
              <Input
                id="whatsapp"
                name="whatsapp"
                type="tel"
                inputMode="tel"
                placeholder="024 123 4567"
                defaultValue={extras.whatsapp ?? ""}
                disabled={same}
                invalid={Boolean(e.whatsapp)}
              />
            </Field>
            {phone && (
              <label className="mt-2 flex items-center gap-2 text-[0.9375rem] text-ink-700">
                <input
                  type="checkbox"
                  name="whatsappSameAsPhone"
                  checked={same}
                  onChange={(ev) => setSame(ev.target.checked)}
                  className="size-4 accent-blue-600"
                />
                Same as business phone ({phone})
              </label>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 font-semibold text-ink-900">Ways to pay</p>
          <Chips name="paymentMethods" options={PAYMENT_METHODS} selected={extras.payment_methods} disabled={readOnly} />
        </div>
        <div>
          <p className="mb-2 font-semibold text-ink-900">What you offer</p>
          <Chips name="amenities" options={AMENITIES} selected={extras.amenities} disabled={readOnly} />
        </div>

        <div>
          <p className="mb-1 font-semibold text-ink-900">Social accounts (optional)</p>
          <p className="mb-3 text-[0.9375rem] text-ink-600">Just the handle, without @. Your website is in Business details above.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIALS.map((s) => (
              <Field key={s.key} id={`social-${s.key}`} label={s.label} error={e[s.key]}>
                <Input
                  id={`social-${s.key}`}
                  name={s.key}
                  autoCapitalize="none"
                  autoCorrect="off"
                  defaultValue={extras.socials[s.key] ?? ""}
                  invalid={Boolean(e[s.key])}
                />
              </Field>
            ))}
          </div>
        </div>
      </fieldset>
      <FormMessage state={state} />
      {!readOnly && <SubmitButton>Save shop details</SubmitButton>}
    </form>
  );
}

export function BranchLocationForm({ branch, readOnly }: { branch: BranchLocation; readOnly: boolean }) {
  const [state, action] = useActionState(saveBranchLocation, idleState);
  const e = state.fieldErrors ?? {};
  const id = (n: string) => `${branch.id}-${n}`;
  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="branchId" value={branch.id} />
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field
          id={id("landmark")}
          label="Landmark"
          error={e.landmark}
          hint="How students spot you, for example: opposite the GCTU main gate."
        >
          <Input id={id("landmark")} name="landmark" defaultValue={branch.landmark ?? ""} invalid={Boolean(e.landmark)} />
        </Field>
        <Field
          id={id("mapsUrl")}
          label="Google Maps link"
          error={e.mapsUrl}
          hint="In Google Maps, open your shop, tap Share, then Copy link."
        >
          <Input
            id={id("mapsUrl")}
            name="mapsUrl"
            type="url"
            inputMode="url"
            placeholder="https://maps.app.goo.gl/…"
            defaultValue={branch.maps_url ?? ""}
            invalid={Boolean(e.mapsUrl)}
          />
        </Field>
      </fieldset>
      <FormMessage state={state} />
      {!readOnly && (
        <SubmitButton variant="secondary" size="md">
          Save location
        </SubmitButton>
      )}
    </form>
  );
}

/** Keeps the photo's shape, shrinks the long side to 1280px, and encodes WebP (JPEG if the browser can't). */
async function toShopPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.82));
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
  if (!jpeg) throw new Error("encode failed");
  return jpeg;
}

export function ShopPhotos({
  merchantId,
  photos,
  photoBase,
  readOnly,
}: {
  merchantId: string;
  photos: ShopPhoto[];
  photoBase: string;
  readOnly: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const left = MAX_PHOTOS - photos.length;

  const upload = async (files: File[]) => {
    setBusy(true);
    setMessage(null);
    let added = 0;
    try {
      const supabase = createClient();
      for (const file of files.slice(0, left)) {
        const blob = await toShopPhoto(file);
        const path = `${merchantId}/${crypto.randomUUID()}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
        const { error } = await supabase.storage
          .from("merchant-photos")
          .upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
        if (error) throw new Error("That photo couldn't be uploaded. Check your connection and try again.");
        const r = await addShopPhoto(merchantId, path, null);
        if (!r.ok) throw new Error(r.message);
        added += 1;
      }
      setMessage(
        files.length > left
          ? `Added ${added}. You can have up to ${MAX_PHOTOS} photos.`
          : `Added ${added} ${added === 1 ? "photo" : "photos"}.`,
      );
    } catch (err) {
      setMessage(`${added ? `Added ${added}. ` : ""}${err instanceof Error ? err.message : "That photo couldn't be uploaded."}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
              <div className="relative aspect-[4/3] bg-ink-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
                <img src={`${photoBase}/${p.path}`} alt={p.caption ?? `Shop photo ${i + 1}`} className="size-full object-cover" />
                {i === 0 && (
                  <span className="absolute top-2 left-2 rounded-full bg-ink-900/80 px-2.5 py-1 text-xs font-semibold text-white">
                    Cover
                  </span>
                )}
              </div>
              {!readOnly && (
                <div className="space-y-2 p-2.5">
                  <form action={editShopPhoto} className="flex gap-1.5">
                    <input type="hidden" name="photoId" value={p.id} />
                    <input type="hidden" name="action" value="caption" />
                    <label htmlFor={`cap-${p.id}`} className="sr-only">
                      Caption
                    </label>
                    <input
                      id={`cap-${p.id}`}
                      name="caption"
                      maxLength={140}
                      defaultValue={p.caption ?? ""}
                      placeholder="Caption"
                      className="min-w-0 flex-1 rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="submit"
                      aria-label={`Save caption for photo ${i + 1}`}
                      className="rounded-lg px-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Save
                    </button>
                  </form>
                  <div className="flex flex-wrap gap-1">
                    {i > 0 && (
                      <form action={editShopPhoto}>
                        <input type="hidden" name="photoId" value={p.id} />
                        <input type="hidden" name="action" value="cover" />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-700 hover:bg-ink-100"
                        >
                          <Star className="size-4" aria-hidden /> Cover
                        </button>
                      </form>
                    )}
                    <form action={editShopPhoto}>
                      <input type="hidden" name="photoId" value={p.id} />
                      <input type="hidden" name="action" value="remove" />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="size-4" aria-hidden /> Remove
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && left > 0 && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            id="shop-photos"
            onChange={(ev) => {
              const files = Array.from(ev.target.files ?? []);
              if (files.length) void upload(files);
            }}
          />
          <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus aria-hidden /> {busy ? "Uploading…" : photos.length ? "Add photos" : "Add your first photos"}
          </Button>
        </>
      )}
      <p className="text-[0.9375rem] text-ink-600">
        {photos.length} of {MAX_PHOTOS}. The first photo is your cover. Show your food, your space and your sign so students recognise you.
      </p>
      <p role="status" className="min-h-6 text-[0.9375rem] font-medium text-ink-700">
        {message}
      </p>
    </div>
  );
}
