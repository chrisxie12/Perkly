import { describe, expect, it } from "vitest";
import { schoolLockReason, withdrawableApplication, type StudentStatus } from "@/features/students/status";
import { canManagePlatform, requiresTwoFactor, type UserContext } from "@/lib/auth/roles";

const profile = {
  institution_id: "11111111-1111-4111-8111-111111111111",
  institution_name: "Test University",
  institution_short_name: "TU",
  campus_id: null,
  programme: null,
  level: null,
  grad_year: null,
  institutional_email: null,
  institutional_email_confirmed: false,
  verified_until: null,
};

const application = (status: NonNullable<StudentStatus["application"]>["status"]) => ({
  id: "22222222-2222-4222-8222-222222222222",
  status,
  student_id_number: null,
  id_card_path: null,
  selfie_path: null,
  institutional_email: null,
  submitted_at: null,
  decided_at: null,
  decision_reason: null,
  reviewer_note: null,
});

const status = (state: StudentStatus["state"], app: StudentStatus["application"], withProfile = true): StudentStatus => ({
  state,
  profile: withProfile ? profile : null,
  application: app,
});

describe("student application recovery", () => {
  it("offers withdrawal for every open application: draft, sent, changes requested", () => {
    expect(withdrawableApplication(status("unverified", application("draft")))?.status).toBe("draft");
    expect(withdrawableApplication(status("pending", application("submitted")))?.status).toBe("submitted");
    expect(withdrawableApplication(status("pending", application("resubmission_requested")))?.status).toBe("resubmission_requested");
  });

  it("offers nothing to withdraw once an application is closed", () => {
    for (const closed of ["approved", "rejected", "withdrawn"] as const) {
      expect(withdrawableApplication(status("unverified", application(closed)))).toBeNull();
    }
    expect(withdrawableApplication(status("unverified", null))).toBeNull();
  });

  it("explains why the school is locked, matching the database rule", () => {
    expect(schoolLockReason(status("unverified", application("draft")))).toBe("open_application");
    expect(schoolLockReason(status("pending", application("resubmission_requested")))).toBe("open_application");
    expect(schoolLockReason(status("verified", application("approved")))).toBe("verified");
    expect(schoolLockReason(status("unverified", application("withdrawn")))).toBeNull();
    expect(schoolLockReason(status("expired", application("approved")))).toBeNull();
    expect(schoolLockReason(status("unverified", null, false))).toBeNull();
  });
});

const ctx = (overrides: Partial<UserContext>): UserContext => ({
  userId: "33333333-3333-4333-8333-333333333333",
  fullName: "Test",
  firstName: "Test",
  signupIntent: "student",
  isSuspended: false,
  platformRole: null,
  aal: "aal2",
  institutionRoles: [],
  ...overrides,
});

describe("role consistency", () => {
  it("lets only platform admins manage the platform", () => {
    expect(canManagePlatform(ctx({ platformRole: "super_admin" }))).toBe(true);
    expect(canManagePlatform(ctx({ platformRole: "admin" }))).toBe(true);
    expect(canManagePlatform(ctx({ platformRole: "support" }))).toBe(false);
    expect(canManagePlatform(ctx({ platformRole: "reviewer" }))).toBe(false);
    expect(canManagePlatform(ctx({}))).toBe(false);
  });

  it("requires two-factor only for staff and institution admins", () => {
    expect(requiresTwoFactor(ctx({ platformRole: "reviewer" }))).toBe(true);
    expect(
      requiresTwoFactor(
        ctx({ institutionRoles: [{ institutionId: "44444444-4444-4444-8444-444444444444", shortName: "TU", role: "admin" }] }),
      ),
    ).toBe(true);
    expect(
      requiresTwoFactor(
        ctx({ institutionRoles: [{ institutionId: "44444444-4444-4444-8444-444444444444", shortName: "TU", role: "reviewer" }] }),
      ),
    ).toBe(false);
    expect(requiresTwoFactor(ctx({ signupIntent: "merchant" }))).toBe(false);
    expect(requiresTwoFactor(ctx({}))).toBe(false);
  });
});
