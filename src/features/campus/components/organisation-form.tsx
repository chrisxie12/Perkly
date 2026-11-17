"use client";

import { useActionState, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { updateOrganisation } from "../actions";
import type { EditorOrganisation } from "../queries";
import { OrganisationAvatar } from "./post-card";
import { uploadCampusImage } from "./upload";

export function OrganisationForm({ organisation, logoUrl }: { organisation: EditorOrganisation; logoUrl: string | null }) {
  const [state, action] = useActionState(updateOrganisation, idleState);
  const [logo, setLogo] = useState<{ path: string | null; preview: string | null }>({ path: organisation.logo_path, preview: logoUrl });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="organisationId" value={organisation.id} />
      {logo.path && <input type="hidden" name="logoPath" value={logo.path} />}
      {organisation.campus_id && <input type="hidden" name="campusId" value={organisation.campus_id} />}
      <div className="flex items-center gap-4">
        <OrganisationAvatar name={organisation.name} url={logo.preview} size="lg" />
        <div>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            className="sr-only"
            id="org-logo"
            onChange={async (ev) => {
              const file = ev.target.files?.[0];
              if (!file) return;
              setUploading(true);
              setUploadError(null);
              try {
                const path = await uploadCampusImage(file, organisation.institution_id, organisation.id, "logo");
                setLogo({ path, preview: URL.createObjectURL(file) });
              } catch (err) {
                setUploadError(err instanceof Error ? err.message : "The logo couldn't be uploaded.");
              } finally {
                setUploading(false);
              }
            }}
          />
          <Button type="button" variant="secondary" disabled={uploading} onClick={() => picker.current?.click()}>
            <ImagePlus aria-hidden /> {uploading ? "Uploading…" : logo.path ? "Change logo" : "Add logo"}
          </Button>
          {uploadError && <FieldError>{uploadError}</FieldError>}
        </div>
      </div>
      <div>
        <Label htmlFor="org-description">About</Label>
        <Textarea id="org-description" name="description" rows={5} maxLength={2000} defaultValue={organisation.description ?? ""} />
        {e.description && <FieldError>{e.description}</FieldError>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="org-email">Contact email</Label>
          <Input
            id="org-email"
            name="contactEmail"
            type="email"
            defaultValue={organisation.contact_email ?? ""}
            invalid={Boolean(e.contactEmail)}
          />
          {e.contactEmail && <FieldError>{e.contactEmail}</FieldError>}
        </div>
        <div>
          <Label htmlFor="org-phone">Contact phone</Label>
          <Input
            id="org-phone"
            name="contactPhone"
            type="tel"
            defaultValue={organisation.contact_phone ?? ""}
            invalid={Boolean(e.contactPhone)}
          />
          {e.contactPhone && <FieldError>{e.contactPhone}</FieldError>}
        </div>
      </div>
      <FieldHint>
        These details appear on your public page too. Use the organisation&apos;s own email and phone, never a personal number.
      </FieldHint>
      <SubmitButton disabled={uploading}>Save</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
