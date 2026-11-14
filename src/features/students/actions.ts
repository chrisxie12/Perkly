"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { isInstitutionalEmailConfirmationEnabled } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { fieldErrors } from "@/features/auth/schemas";
import type { FormState } from "@/features/auth/types";
import { applicationSchema, emailCodeSchema, institutionalEmailSchema, studentProfileSchema } from "./schemas";
import { studentErrorMessage } from "./status";

const notConfigured: FormState = { status: "error", message: "This isn't available in this environment yet." };

async function client() {
  return createClient();
}

export async function saveStudentProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = studentProfileSchema.safeParse({
    institutionId: formData.get("institutionId"),
    campusId: formData.get("campusId") ?? "",
    programme: formData.get("programme") ?? "",
    level: formData.get("level") ?? "",
    gradYear: formData.get("gradYear") ?? "",
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return notConfigured;

  const supabase = await client();
  const { error } = await supabase.rpc("upsert_student_profile", {
    p_institution_id: parsed.data.institutionId,
    p_campus_id: parsed.data.campusId,
    p_programme: parsed.data.programme ?? null,
    p_level: parsed.data.level,
    p_grad_year: parsed.data.gradYear,
  });
  if (error) return { status: "error", message: studentErrorMessage(error.message) };
  revalidatePath("/student", "layout");
  return { status: "success", message: "Saved." };
}

/** Adds, changes or (when empty) removes the optional institutional email. */
export async function saveInstitutionalEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = institutionalEmailSchema.safeParse({ institutionalEmail: formData.get("institutionalEmail") ?? "" });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return notConfigured;

  const supabase = await client();
  const { error } = await supabase.rpc("set_institutional_email", { p_email: parsed.data.institutionalEmail || null });
  if (error) return { status: "error", message: studentErrorMessage(error.message) };
  revalidatePath("/student", "layout");
  return { status: "success", message: parsed.data.institutionalEmail ? "Institutional email saved." : "Institutional email removed." };
}

/** Emails a 6-digit code to the institutional email. Needs the secret key and Resend. */
export async function sendInstitutionalEmailCode(): Promise<FormState> {
  if (!hasSupabaseEnv() || !isInstitutionalEmailConfirmationEnabled()) {
    return { status: "error", message: "Email confirmation isn't switched on yet. You can still apply without it." };
  }
  const supabase = await client();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { status: "error", message: "Sign in again to continue." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("issue_institutional_email_code", { p_user_id: userId });
  if (error || !data) return { status: "error", message: studentErrorMessage(error?.message) };
  const { email, code } = data as { email: string; code: string };

  try {
    await sendEmail({
      to: email,
      subject: "Your Perqly code",
      text: `Your code to confirm this email on Perqly is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`,
      html: `<p>Your code to confirm this email on Perqly is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>`,
    });
  } catch {
    return { status: "error", message: "We couldn't send the email. Try again in a few minutes." };
  }
  return { status: "success", message: "Code sent. Check that inbox." };
}

export async function confirmInstitutionalEmailCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailCodeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return notConfigured;

  const supabase = await client();
  const { data, error } = await supabase.rpc("confirm_institutional_email_code", { p_code: parsed.data.code });
  if (error) return { status: "error", message: studentErrorMessage(error.message) };
  if (data !== true) return { status: "error", fieldErrors: { code: "That code isn't right. Check the latest email." } };
  revalidatePath("/student", "layout");
  return { status: "success", message: "Institutional email confirmed." };
}

/** Returns the student's open application, creating a draft if needed (used before the first upload). */
export async function ensureVerificationApplication(): Promise<{ ok: true; applicationId: string } | { ok: false; message: string }> {
  if (!hasSupabaseEnv()) return { ok: false, message: notConfigured.message! };
  const supabase = await client();
  const { data, error } = await supabase.rpc("start_verification_application");
  if (error || typeof data !== "string") return { ok: false, message: studentErrorMessage(error?.message) };
  return { ok: true, applicationId: data };
}

export async function submitVerificationApplication(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = applicationSchema.safeParse({
    applicationId: formData.get("applicationId"),
    studentIdNumber: formData.get("studentIdNumber"),
    idCardPath: formData.get("idCardPath") ?? "",
    selfiePath: formData.get("selfiePath") ?? "",
    includeInstitutionalEmail: formData.get("includeInstitutionalEmail") ?? "",
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!hasSupabaseEnv()) return notConfigured;

  const supabase = await client();
  const { error } = await supabase.rpc("submit_verification_application", {
    p_application_id: parsed.data.applicationId,
    p_student_id_number: parsed.data.studentIdNumber,
    p_id_card_path: parsed.data.idCardPath,
    p_selfie_path: parsed.data.selfiePath,
    p_include_institutional_email: parsed.data.includeInstitutionalEmail,
  });
  if (error) {
    const message = studentErrorMessage(error.message);
    if (error.message === "student_id_invalid") return { status: "error", fieldErrors: { studentIdNumber: message } };
    if (error.message === "id_card_missing") return { status: "error", fieldErrors: { idCardPath: message } };
    if (error.message === "selfie_missing") return { status: "error", fieldErrors: { selfiePath: message } };
    return { status: "error", message };
  }
  revalidatePath("/student", "layout");
  return { status: "success", message: "Application sent to your school's reviewers." };
}

export async function withdrawVerificationApplication(formData: FormData): Promise<void> {
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!hasSupabaseEnv() || !/^[0-9a-f-]{36}$/.test(applicationId)) redirect("/student/verify?withdraw=failed");
  const supabase = await client();
  const { error } = await supabase.rpc("withdraw_verification_application", { p_application_id: applicationId });
  revalidatePath("/student", "layout");
  redirect(
    error ? `/student/verify?withdraw=failed&reason=${encodeURIComponent(error.message.slice(0, 40))}` : "/student/verify?withdraw=done",
  );
}
