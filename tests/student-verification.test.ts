import { describe, expect, it } from "vitest";
import { applicationSchema, institutionalEmailSchema, studentProfileSchema } from "@/features/students/schemas";
import { parseStudentStatus, stateLabel, studentErrorMessage, verificationView, type StudentStatus } from "@/features/students/status";

const profile = {
  institution_id: "00000000-0000-4000-8000-0000000000aa",
  institution_name: "Ghana Communication Technology University",
  institution_short_name: "GCTU",
  campus_id: null,
  programme: "BSc Computer Science",
  level: "300",
  grad_year: 2027,
  institutional_email: null,
  institutional_email_confirmed: false,
  verified_until: null,
};
const application = {
  id: "00000000-0000-4000-8000-0000000000bb",
  status: "submitted" as const,
  student_id_number: "GCTU/2023/0001",
  id_card_path: "u/a/id-card.webp",
  selfie_path: "u/a/selfie.webp",
  institutional_email: null,
  submitted_at: "2026-11-14T10:00:00Z",
  decided_at: null,
  decision_reason: null,
  reviewer_note: null,
};
const status = (overrides: Partial<StudentStatus>): StudentStatus =>
  parseStudentStatus({ state: "unverified", profile, application: null, ...overrides });

describe("student profile form", () => {
  it("needs only a school; everything else, including an institutional email, is optional", () => {
    const result = studentProfileSchema.safeParse({
      institutionId: profile.institution_id,
      campusId: "",
      programme: "",
      level: "",
      gradYear: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ campusId: null, programme: null, level: null, gradYear: null });
  });

  it("rejects a missing school", () => {
    expect(studentProfileSchema.safeParse({ institutionId: "" }).success).toBe(false);
  });
});

describe("institutional email", () => {
  it("is optional: an empty value means remove it", () => {
    expect(institutionalEmailSchema.parse({ institutionalEmail: "" }).institutionalEmail).toBe("");
  });

  it("is normalised and validated when given", () => {
    expect(institutionalEmailSchema.parse({ institutionalEmail: " Ama@St.GCTU.edu.gh " }).institutionalEmail).toBe("ama@st.gctu.edu.gh");
    expect(institutionalEmailSchema.safeParse({ institutionalEmail: "not-an-email" }).success).toBe(false);
  });
});

describe("verification application form", () => {
  const base = { applicationId: application.id, studentIdNumber: "GCTU/2023/0001", idCardPath: "a", selfiePath: "b" };

  it("can be submitted without an institutional email", () => {
    const result = applicationSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.includeInstitutionalEmail).toBe(false);
  });

  it("can include the institutional email when the student ticks the box", () => {
    expect(applicationSchema.parse({ ...base, includeInstitutionalEmail: "on" }).includeInstitutionalEmail).toBe(true);
  });

  it("requires the student ID number and both photos", () => {
    const result = applicationSchema.safeParse({ applicationId: application.id, studentIdNumber: "", idCardPath: "", selfiePath: "" });
    expect(result.success).toBe(false);
    if (!result.success)
      expect([...new Set(result.error.issues.map((issue) => issue.path[0]))].sort()).toEqual([
        "idCardPath",
        "selfiePath",
        "studentIdNumber",
      ]);
  });

  it("rejects unsafe characters in the student ID number", () => {
    expect(applicationSchema.safeParse({ ...base, studentIdNumber: "<script>" }).success).toBe(false);
  });
});

describe("verification state on screen", () => {
  it("asks for a school first", () => {
    expect(verificationView(status({ profile: null }))).toBe("needs_profile");
  });

  it("shows pending, changes requested, rejected, approved and expired", () => {
    expect(verificationView(status({ state: "pending", application }))).toBe("pending");
    expect(verificationView(status({ state: "pending", application: { ...application, status: "resubmission_requested" } }))).toBe(
      "resubmit",
    );
    expect(verificationView(status({ application: { ...application, status: "rejected", decision_reason: "id_mismatch" } }))).toBe(
      "rejected",
    );
    expect(verificationView(status({ state: "verified", application: { ...application, status: "approved" } }))).toBe("verified");
    expect(verificationView(status({ state: "expired" }))).toBe("expired");
    expect(stateLabel(status({ state: "verified" }))).toBe("Approved");
  });

  it("a confirmed institutional email on its own still shows as not verified", () => {
    const s = status({ profile: { ...profile, institutional_email: "ama@st.gctu.edu.gh", institutional_email_confirmed: true } });
    expect(verificationView(s)).toBe("apply");
    expect(stateLabel(s)).toBe("Not verified");
  });

  it("explains database errors in plain words", () => {
    expect(studentErrorMessage("cannot_review_own")).toMatch(/own application/);
    expect(studentErrorMessage("unknown_code")).toMatch(/Something went wrong/);
  });
});
