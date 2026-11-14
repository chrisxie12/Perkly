"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, IdCard, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/images/compress";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { FormMessage } from "@/features/auth/components/form-message";
import { SubmitButton } from "@/features/auth/components/submit-button";
import { idleState } from "@/features/auth/types";
import { ensureVerificationApplication, submitVerificationApplication } from "../actions";

type Kind = "id-card" | "selfie";
type Upload = { status: "empty" | "uploading" | "done" | "error"; path: string; preview?: string; message?: string };

const BUCKET = "verification-documents";

function UploadField({
  kind,
  title,
  hint,
  upload,
  onFile,
  error,
}: {
  kind: Kind;
  title: string;
  hint: string;
  upload: Upload;
  onFile: (kind: Kind, file: File) => void;
  error?: string;
}) {
  const inputId = `${kind}-file`;
  const Icon = kind === "id-card" ? IdCard : Camera;
  return (
    <div>
      <Label htmlFor={inputId}>{title}</Label>
      <label
        htmlFor={inputId}
        className="flex cursor-pointer items-center gap-4 rounded-xl bg-white p-4 ring-1 ring-ink-300 ring-inset hover:bg-ink-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500"
      >
        {upload.preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview of the student's own photo
          <img src={upload.preview} alt="" className="size-16 rounded-lg object-cover" />
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
            <Icon className="size-7" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink-900">
            {upload.status === "done" ? "Added. Tap to replace" : upload.status === "uploading" ? "Uploading…" : "Take or choose a photo"}
          </span>
          <span className="mt-0.5 block text-sm text-ink-600">{hint}</span>
        </span>
        {upload.status === "uploading" && <Loader2 className="size-5 animate-spin text-blue-500" aria-hidden />}
        {upload.status === "done" && <CheckCircle2 className="size-5 text-success" aria-hidden />}
        <input
          id={inputId}
          type="file"
          accept="image/*"
          capture={kind === "selfie" ? "user" : "environment"}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(kind, file);
            event.target.value = "";
          }}
        />
      </label>
      {(error || upload.status === "error") && <FieldError>{upload.message ?? error}</FieldError>}
    </div>
  );
}

export function VerificationForm({
  userId,
  applicationId: initialApplicationId,
  institutionShortName,
  initialStudentIdNumber,
  idCardPath,
  selfiePath,
  institutionalEmail,
  institutionalEmailConfirmed,
}: {
  userId: string;
  applicationId: string | null;
  institutionShortName: string;
  initialStudentIdNumber: string | null;
  idCardPath: string | null;
  selfiePath: string | null;
  institutionalEmail: string | null;
  institutionalEmailConfirmed: boolean;
}) {
  const [state, action] = useActionState(submitVerificationApplication, idleState);
  const [applicationId, setApplicationId] = useState(initialApplicationId);
  const [uploads, setUploads] = useState<Record<Kind, Upload>>({
    "id-card": { status: idCardPath ? "done" : "empty", path: idCardPath ?? "" },
    selfie: { status: selfiePath ? "done" : "empty", path: selfiePath ?? "" },
  });
  const previews = useRef<string[]>([]);

  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function handleFile(kind: Kind, file: File) {
    setUploads((current) => ({ ...current, [kind]: { ...current[kind], status: "uploading", message: undefined } }));
    try {
      let id = applicationId;
      if (!id) {
        const result = await ensureVerificationApplication();
        if (!result.ok) throw new Error(result.message);
        id = result.applicationId;
        setApplicationId(id);
      }
      const { blob, extension } = await compressImage(file);
      const path = `${userId}/${id}/${kind}.${extension}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "0" });
      if (error) throw new Error("upload_failed");
      const preview = URL.createObjectURL(blob);
      previews.current.push(preview);
      setUploads((current) => ({ ...current, [kind]: { status: "done", path, preview } }));
    } catch (error) {
      const message =
        error instanceof Error && error.message === "not_an_image"
          ? "Choose a photo (JPG, PNG or similar)."
          : error instanceof Error && error.message !== "upload_failed" && !error.message.includes("_")
            ? error.message
            : "That photo didn't upload. Check your connection and try again.";
      setUploads((current) => ({ ...current, [kind]: { ...current[kind], status: "error", message } }));
    }
  }

  const busy = uploads["id-card"].status === "uploading" || uploads.selfie.status === "uploading";
  const errors = state.fieldErrors ?? {};

  if (state.status === "success") {
    return <FormMessage state={state} />;
  }

  return (
    <form action={action} noValidate className="space-y-6">
      <input type="hidden" name="applicationId" value={applicationId ?? ""} />
      <input type="hidden" name="idCardPath" value={uploads["id-card"].status === "done" ? uploads["id-card"].path : ""} />
      <input type="hidden" name="selfiePath" value={uploads.selfie.status === "done" ? uploads.selfie.path : ""} />

      <div>
        <Label htmlFor="studentIdNumber">{institutionShortName} student ID number</Label>
        <Input
          id="studentIdNumber"
          name="studentIdNumber"
          defaultValue={initialStudentIdNumber ?? ""}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          invalid={Boolean(errors.studentIdNumber)}
          aria-describedby={errors.studentIdNumber ? "studentIdNumber-error" : undefined}
        />
        {errors.studentIdNumber && <FieldError id="studentIdNumber-error">{errors.studentIdNumber}</FieldError>}
      </div>

      <UploadField
        kind="id-card"
        title="Photo of your student ID card"
        hint="The side with your photo and ID number. Make sure it's sharp and readable."
        upload={uploads["id-card"]}
        onFile={handleFile}
        error={errors.idCardPath}
      />
      <UploadField
        kind="selfie"
        title="A selfie"
        hint="Face the camera in good light, so the reviewer can match you to your ID."
        upload={uploads.selfie}
        onFile={handleFile}
        error={errors.selfiePath}
      />

      {institutionalEmail ? (
        <label className="flex items-start gap-3 text-[0.9375rem] leading-snug text-ink-700">
          <input
            type="checkbox"
            name="includeInstitutionalEmail"
            value="on"
            defaultChecked
            className="mt-0.5 size-5 shrink-0 accent-blue-500"
          />
          <span>
            Include my institutional email <strong className="font-semibold text-ink-900">{institutionalEmail}</strong> (
            {institutionalEmailConfirmed ? "confirmed" : "not confirmed"}). Optional.
          </span>
        </label>
      ) : (
        <FieldHint>No institutional email? That&apos;s fine. It&apos;s optional, and you can add one in your profile.</FieldHint>
      )}

      <p className="rounded-xl bg-blue-50 p-4 text-[0.9375rem] leading-relaxed text-blue-900 ring-1 ring-blue-100">
        {institutionShortName}&apos;s appointed reviewers will see these details and photos to confirm you&apos;re a student. Only they can
        open the photos, every view is logged, and Perqly deletes them 30 days after the decision.
      </p>

      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full sm:w-auto" disabled={busy}>
        Send to {institutionShortName} for review
      </SubmitButton>
    </form>
  );
}
