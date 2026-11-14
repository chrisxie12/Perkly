import { z } from "zod";

const stateSchema = z.enum(["unverified", "pending", "verified", "expired", "suspended"]);
const applicationStatusSchema = z.enum(["draft", "submitted", "approved", "rejected", "resubmission_requested", "withdrawn"]);

const statusSchema = z.object({
  state: stateSchema.catch("unverified"),
  profile: z
    .object({
      institution_id: z.uuid(),
      institution_name: z.string(),
      institution_short_name: z.string(),
      campus_id: z.uuid().nullable(),
      programme: z.string().nullable(),
      level: z.string().nullable(),
      grad_year: z.number().nullable(),
      institutional_email: z.string().nullable(),
      institutional_email_confirmed: z.boolean(),
      verified_until: z.string().nullable(),
    })
    .nullable(),
  application: z
    .object({
      id: z.uuid(),
      status: applicationStatusSchema,
      student_id_number: z.string().nullable(),
      id_card_path: z.string().nullable(),
      selfie_path: z.string().nullable(),
      institutional_email: z.string().nullable(),
      submitted_at: z.string().nullable(),
      decided_at: z.string().nullable(),
      decision_reason: z.string().nullable(),
      reviewer_note: z.string().nullable(),
    })
    .nullable(),
});

export type StudentStatus = z.infer<typeof statusSchema>;
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export function parseStudentStatus(raw: unknown): StudentStatus {
  return statusSchema.parse(raw);
}

/** What the verification page should show. */
export type VerificationView = "needs_profile" | "apply" | "pending" | "resubmit" | "rejected" | "verified" | "expired" | "suspended";

export function verificationView(status: StudentStatus): VerificationView {
  if (status.state === "suspended") return "suspended";
  if (!status.profile) return "needs_profile";
  const app = status.application;
  if (app?.status === "submitted") return "pending";
  if (app?.status === "resubmission_requested") return "resubmit";
  if (status.state === "verified") return "verified";
  if (status.state === "expired") return "expired";
  if (app?.status === "rejected") return "rejected";
  return "apply";
}

/** Student-facing state names (approved product language: pending, approved, rejected, expired). */
export function stateLabel(status: StudentStatus): string {
  switch (verificationView(status)) {
    case "verified":
      return "Approved";
    case "pending":
      return "Pending review";
    case "resubmit":
      return "Changes requested";
    case "rejected":
      return "Not approved";
    case "expired":
      return "Expired";
    case "suspended":
      return "Suspended";
    default:
      return "Not verified";
  }
}

export const REJECTION_REASONS: Record<string, string> = {
  not_enrolled: "Your school couldn't confirm that you're currently enrolled.",
  id_mismatch: "The student ID number didn't match the school's records.",
  photo_mismatch: "The selfie didn't match the photo on the student ID.",
  unreadable_documents: "The photos were too hard to read.",
  duplicate_account: "This student ID is already verified on another Perqly account.",
  other: "See the reviewer's note.",
};

/** Plain messages for the named errors raised by the database functions. */
export function studentErrorMessage(code: string | undefined): string {
  switch (code) {
    case "profile_required":
      return "Add your school first.";
    case "institution_unavailable":
      return "That school isn't on Perqly yet.";
    case "campus_invalid":
      return "Choose a campus that belongs to your school.";
    case "institution_locked":
      return "You can't change school while an application is open or you're verified. Withdraw the application first.";
    case "already_verified":
      return "You're already verified. You can renew in the last 30 days before it expires.";
    case "application_not_editable":
      return "This application can't be changed any more.";
    case "student_id_invalid":
      return "Check your student ID number. Use letters, numbers, slashes, dots, spaces and hyphens only.";
    case "id_card_missing":
      return "Add a photo of your student ID card.";
    case "selfie_missing":
      return "Add a selfie.";
    case "code_invalid":
      return "That code has expired or been used too many times. Send a new one.";
    case "institutional_email_missing":
      return "Add an institutional email first.";
    case "rate_limited":
      return "Too many attempts. Wait a while, then try again.";
    case "account_suspended":
      return "Your account is suspended. Contact Perqly support.";
    case "forbidden":
      return "You don't have permission to do that.";
    case "cannot_review_own":
      return "You can't review your own application.";
    case "application_not_pending":
      return "This application has already been decided.";
    case "student_id_in_use":
      return "This student ID is already verified on another Perqly account. Reject it as a duplicate, or contact Perqly support.";
    case "reason_required":
      return "Choose a reason.";
    case "note_required":
      return "Write a short note for the student.";
    default:
      return "Something went wrong. Try again in a moment.";
  }
}

const OPEN_STATUSES: ApplicationStatus[] = ["draft", "submitted", "resubmission_requested"];

/** The open application a student may withdraw (draft, sent, or sent back for changes), or null. */
export function withdrawableApplication(status: StudentStatus): { id: string; status: ApplicationStatus } | null {
  const app = status.application;
  return app && OPEN_STATUSES.includes(app.status) ? { id: app.id, status: app.status } : null;
}

/**
 * Why the student can't change school right now, mirroring upsert_student_profile():
 * an open application, or an active verification. Null when the school can change.
 */
export function schoolLockReason(status: StudentStatus): "open_application" | "verified" | null {
  if (!status.profile) return null;
  if (withdrawableApplication(status)) return "open_application";
  if (status.state === "pending" || status.state === "verified") return "verified";
  return null;
}
