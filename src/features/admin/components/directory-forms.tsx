"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { InstitutionLogo } from "@/features/institutions/logo";
import { saveCampusDetails, saveDirectoryDetails, setInstitutionLogo } from "../actions";
import type { CampusDetail, InstitutionRow } from "../queries";

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

export const ACCREDITATION_LABEL = {
  unverified: "Not checked yet",
  confirmed: "Confirmed on GTEC",
  not_found: "Not found on GTEC",
  closed: "Closed / not operating",
} as const;

export function DirectoryForm({ institution }: { institution: InstitutionRow }) {
  const [state, action] = useActionState(saveDirectoryDetails, idleState);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-4">
      <input type="hidden" name="institutionId" value={institution.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="institutionType" label="Type">
          <NativeSelect id="institutionType" name="institutionType" defaultValue={institution.institution_type ?? ""}>
            <option value="">Not set</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </NativeSelect>
        </Field>
        <Field id="accreditationStatus" label="GTEC accreditation" hint="Check the institution on gtec.edu.gh, then record what you found.">
          <NativeSelect id="accreditationStatus" name="accreditationStatus" defaultValue={institution.accreditation_status}>
            {Object.entries(ACCREDITATION_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field
        id="accreditationNote"
        label="Note (optional)"
        error={e.accreditationNote}
        hint="What you checked, for example the GTEC page you used."
      >
        <Input id="accreditationNote" name="accreditationNote" defaultValue={institution.accreditation_note ?? ""} maxLength={300} />
      </Field>
      <Field id="officialWebsite" label="Official website" error={e.officialWebsite}>
        <Input
          id="officialWebsite"
          name="officialWebsite"
          type="url"
          inputMode="url"
          placeholder="https://"
          defaultValue={institution.official_website ?? ""}
          invalid={Boolean(e.officialWebsite)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="city" label="City">
          <Input id="city" name="city" defaultValue={institution.city ?? ""} />
        </Field>
        <Field id="region" label="Region">
          <Input id="region" name="region" defaultValue={institution.region ?? ""} />
        </Field>
      </div>
      <Field
        id="infoSourceUrl"
        label="Where these details came from"
        error={e.infoSourceUrl}
        hint="A page on the official website, ideally."
      >
        <Input
          id="infoSourceUrl"
          name="infoSourceUrl"
          type="url"
          defaultValue={institution.info_source_url ?? ""}
          invalid={Boolean(e.infoSourceUrl)}
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="md">
        Save directory details
      </SubmitButton>
    </form>
  );
}

const LOGO_TYPES: Record<string, string> = { "image/svg+xml": "svg", "image/png": "png", "image/webp": "webp" };

export function LogoUploader({ institution, logoUrl }: { institution: InstitutionRow; logoUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState(institution.logo_source_url ?? institution.official_website ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const upload = async (file: File) => {
    setMessage(null);
    const ext = LOGO_TYPES[file.type];
    if (!ext) return setMessage("Use the official SVG, or a PNG or WebP with a transparent background.");
    if (file.size > 512 * 1024) return setMessage("That file is over 512 KB. Use the official SVG or a smaller PNG.");
    if (!/^https:\/\//.test(source.trim())) return setMessage("First add the official page this logo came from.");
    setBusy(true);
    const path = `${institution.id}/logo-${Date.now()}.${ext}`;
    const { error } = await createClient()
      .storage.from("institution-logos")
      .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) {
      setBusy(false);
      return setMessage("The logo didn't upload. Check your connection and that you're signed in with two-factor.");
    }
    const r = await setInstitutionLogo(institution.id, path, source);
    setBusy(false);
    if (!r.ok) return setMessage(r.message ?? "That didn't save.");
    setMessage("Logo saved.");
    if (input.current) input.current.value = "";
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <InstitutionLogo src={logoUrl} name={institution.name} shortName={institution.short_name} size="lg" />
        {/* The same logo on a dark background, to check it stays legible */}
        <span className="rounded-2xl bg-ink-900 p-2">
          <InstitutionLogo src={logoUrl} name={institution.name} shortName={institution.short_name} size="lg" />
        </span>
        <p className="text-[0.9375rem] text-ink-700">
          {institution.logo_status === "official" ? (
            <>
              Official logo from{" "}
              <a
                href={institution.logo_source_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold break-all text-blue-700 underline"
              >
                {institution.logo_source_url?.replace(/^https:\/\//, "")}
              </a>
            </>
          ) : (
            "Pending: students see the short name until an official logo is added."
          )}
        </p>
      </div>
      <Field
        id="logoSource"
        label="Official page the logo came from"
        hint="Download the logo from the institution's own website, never from search results."
      >
        <Input
          id="logoSource"
          type="url"
          inputMode="url"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="https://"
        />
      </Field>
      <input
        ref={input}
        id={`logo-${institution.id}`}
        type="file"
        accept="image/svg+xml,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
        <Upload aria-hidden /> {busy ? "Uploading…" : institution.logo_status === "official" ? "Replace logo" : "Upload official logo"}
      </Button>
      <p role="status" className="min-h-6 text-[0.9375rem] font-medium text-ink-700">
        {message}
      </p>
    </div>
  );
}

export function CampusDetailsForm({ institutionId, campus }: { institutionId: string; campus: CampusDetail }) {
  const [state, action] = useActionState(saveCampusDetails, idleState);
  const e = state.fieldErrors ?? {};
  const id = (n: string) => `${campus.id}-${n}`;
  return (
    <form action={action} noValidate className="mt-3 space-y-3 rounded-2xl bg-ink-50 p-4">
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="campusId" value={campus.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id("type")} label="Type">
          <NativeSelect id={id("type")} name="campusType" defaultValue={campus.campus_type}>
            <option value="main">Main campus</option>
            <option value="satellite">Campus</option>
            <option value="city">City campus</option>
            <option value="learning_centre">Learning centre</option>
          </NativeSelect>
        </Field>
        <Field id={id("status")} label="Details checked">
          <NativeSelect id={id("status")} name="infoStatus" defaultValue={campus.info_status}>
            <option value="confirmed">Confirmed on an official source</option>
            <option value="unverified">Not yet confirmed</option>
          </NativeSelect>
        </Field>
      </div>
      <Field id={id("address")} label="Address or landmark">
        <Input id={id("address")} name="address" defaultValue={campus.address ?? ""} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id("city")} label="City">
          <Input id={id("city")} name="city" defaultValue={campus.city ?? ""} />
        </Field>
        <Field id={id("region")} label="Region">
          <Input id={id("region")} name="region" defaultValue={campus.region ?? ""} />
        </Field>
      </div>
      <Field id={id("source")} label="Source" error={e.sourceUrl}>
        <Input id={id("source")} name="sourceUrl" type="url" defaultValue={campus.source_url ?? ""} invalid={Boolean(e.sourceUrl)} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="sm">
        Save campus
      </SubmitButton>
    </form>
  );
}
