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
  delegatedInstitutions: [],
  merchantRoles: [],
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

describe("phase 2 routing", () => {
  const du = { institutionId: "55555555-5555-4555-8555-555555555555", shortName: "DU" };

  it("sends Perqly staff with delegated schools to the review area, through two-factor", async () => {
    const { areasFor, decideAccess } = await import("@/lib/auth/roles");
    const staff = ctx({ platformRole: "reviewer", delegatedInstitutions: [du], aal: "aal1" });
    expect(areasFor(staff)).toContain("institution");
    expect(decideAccess("institution", staff).kind).toBe("mfa");
    expect(decideAccess("institution", { ...staff, aal: "aal2" }).kind).toBe("allow");
  });

  it("keeps staff out of the review area when no school is delegated", async () => {
    const { areasFor, decideAccess } = await import("@/lib/auth/roles");
    const staff = ctx({ platformRole: "admin" });
    expect(areasFor(staff)).not.toContain("institution");
    expect(decideAccess("institution", staff).kind).toBe("forbidden");
  });

  it("lets a plain institution reviewer in without two-factor", async () => {
    const { decideAccess } = await import("@/lib/auth/roles");
    const reviewer = ctx({ aal: "aal1", institutionRoles: [{ institutionId: du.institutionId, shortName: "TU", role: "reviewer" }] });
    expect(decideAccess("institution", reviewer).kind).toBe("allow");
  });

  it("shows the Reviewers menu only to institution admins", async () => {
    const { institutionNavFor } = await import("@/app/institution/institution-nav");
    const admin = ctx({ institutionRoles: [{ institutionId: du.institutionId, shortName: "TU", role: "admin" }] });
    const reviewer = ctx({ institutionRoles: [{ institutionId: du.institutionId, shortName: "TU", role: "reviewer" }] });
    expect(institutionNavFor(admin).map((item) => item.label)).toContain("Reviewers");
    expect(institutionNavFor(reviewer).map((item) => item.label)).not.toContain("Reviewers");
  });

  it("reads delegated schools from the database context, and copes with older responses", async () => {
    const { parseUserContext } = await import("@/lib/auth/roles");
    const raw = {
      user_id: "33333333-3333-4333-8333-333333333333",
      full_name: "Staff",
      first_name: "Staff",
      signup_intent: null,
      is_suspended: false,
      platform_role: "reviewer",
      aal: "aal2",
      institution_roles: [],
    };
    expect(parseUserContext(raw).delegatedInstitutions).toEqual([]);
    expect(
      parseUserContext({ ...raw, delegated_institutions: [{ institution_id: du.institutionId, short_name: "DU" }] }).delegatedInstitutions,
    ).toEqual([du]);
  });
});

describe("merchant roles", () => {
  const shop = { merchantId: "66666666-6666-4666-8666-666666666666", displayName: "Fresh Fade", status: "approved" as const };

  it("opens the business area to anyone who chose it at sign-up or works for a business", async () => {
    const { areasFor } = await import("@/lib/auth/roles");
    expect(areasFor(ctx({ signupIntent: "merchant" }))).toContain("merchant");
    expect(areasFor(ctx({ merchantRoles: [{ ...shop, role: "cashier" }] }))).toContain("merchant");
    expect(areasFor(ctx({}))).not.toContain("merchant");
  });

  it("asks owners for two-factor but not managers or cashiers", async () => {
    const { decideAccess, requiresTwoFactor } = await import("@/lib/auth/roles");
    const owner = ctx({ aal: "aal1", merchantRoles: [{ ...shop, role: "owner" }] });
    expect(decideAccess("merchant", owner).kind).toBe("mfa");
    expect(decideAccess("merchant", { ...owner, aal: "aal2" }).kind).toBe("allow");
    expect(requiresTwoFactor(owner)).toBe(true);
    const cashier = ctx({ aal: "aal1", merchantRoles: [{ ...shop, role: "cashier" }] });
    expect(decideAccess("merchant", cashier).kind).toBe("allow");
    expect(requiresTwoFactor(cashier)).toBe(false);
  });

  it("shows cashiers only the overview, and managers the business pages", async () => {
    const { merchantNavFor } = await import("@/app/merchant/merchant-nav");
    expect(merchantNavFor({ ...shop, role: "cashier" }).map((i) => i.label)).toEqual(["Overview"]);
    expect(merchantNavFor({ ...shop, role: "manager" }).map((i) => i.label)).toEqual([
      "Overview",
      "Offers",
      "Catalogue",
      "Branches",
      "Team",
      "Profile",
    ]);
  });

  it("validates merchant forms the way the database does", async () => {
    const { branchSchema, teamMemberSchema, merchantDecisionSchema } = await import("@/features/merchants/schemas");
    const merchantId = shop.merchantId;
    expect(branchSchema.safeParse({ merchantId, name: "Tesano", digitalAddress: "ga-123-4567" }).data?.digitalAddress).toBe("GA-123-4567");
    expect(branchSchema.safeParse({ merchantId, name: "Tesano", latitude: "5.6" }).success).toBe(false);
    expect(teamMemberSchema.safeParse({ merchantId, email: "a@b.co", role: "cashier", branchIds: [] }).success).toBe(false);
    expect(merchantDecisionSchema.safeParse({ merchantId, decision: "reject" }).success).toBe(false);
    expect(merchantDecisionSchema.safeParse({ merchantId, decision: "approve" }).success).toBe(true);
  });
});
