import { describe, expect, it } from "vitest";
import { areasFor, decideAccess, defaultDestination, parseUserContext, type UserContext } from "@/lib/auth/roles";

const base: UserContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  fullName: "Ama Kwarteng",
  firstName: "Ama",
  signupIntent: "student",
  isSuspended: false,
  platformRole: null,
  aal: "aal1",
  institutionRoles: [],
  delegatedInstitutions: [],
};
const gctu = { institutionId: "00000000-0000-4000-8000-0000000000aa", shortName: "GCTU" };

describe("parseUserContext", () => {
  it("parses the database function's result and prefers the token's assurance level", () => {
    const ctx = parseUserContext(
      {
        user_id: base.userId,
        full_name: "Ama Kwarteng",
        first_name: "Ama",
        signup_intent: "student",
        is_suspended: false,
        platform_role: "admin",
        aal: "aal1",
        institution_roles: [{ institution_id: gctu.institutionId, short_name: "GCTU", role: "reviewer" }],
      },
      "aal2",
    );
    expect(ctx).toMatchObject({ platformRole: "admin", aal: "aal2", institutionRoles: [{ shortName: "GCTU", role: "reviewer" }] });
  });

  it("rejects malformed data", () => {
    expect(() => parseUserContext({ user_id: "not-a-uuid" })).toThrow();
  });
});

describe("decideAccess", () => {
  it("lets every signed-in user into the student area", () => {
    expect(decideAccess("student", base)).toEqual({ kind: "allow" });
  });

  it("blocks suspended accounts everywhere", () => {
    const ctx = { ...base, isSuspended: true, platformRole: "super_admin" as const, aal: "aal2" as const };
    for (const area of ["student", "merchant", "institution", "admin"] as const) {
      expect(decideAccess(area, ctx)).toEqual({ kind: "suspended" });
    }
  });

  it("keeps people without a reviewer role out of the institution area", () => {
    expect(decideAccess("institution", base)).toEqual({ kind: "forbidden" });
  });

  it("lets reviewers in without two-factor, but requires it for institution admins", () => {
    expect(decideAccess("institution", { ...base, institutionRoles: [{ ...gctu, role: "reviewer" }] })).toEqual({ kind: "allow" });
    expect(decideAccess("institution", { ...base, institutionRoles: [{ ...gctu, role: "admin" }] })).toEqual({ kind: "mfa" });
    expect(decideAccess("institution", { ...base, aal: "aal2", institutionRoles: [{ ...gctu, role: "admin" }] })).toEqual({
      kind: "allow",
    });
  });

  it("requires a staff role and two-factor for the admin area", () => {
    expect(decideAccess("admin", base)).toEqual({ kind: "forbidden" });
    expect(decideAccess("admin", { ...base, platformRole: "support" })).toEqual({ kind: "mfa" });
    expect(decideAccess("admin", { ...base, platformRole: "support", aal: "aal2" })).toEqual({ kind: "allow" });
  });
});

describe("defaultDestination", () => {
  it("sends students to the student area", () => {
    expect(defaultDestination(base)).toEqual({ kind: "redirect", path: "/student" });
  });

  it("sends merchants to the merchant area", () => {
    expect(defaultDestination({ ...base, signupIntent: "merchant" })).toEqual({ kind: "redirect", path: "/merchant" });
  });

  it("asks people with several roles where to go", () => {
    const ctx = { ...base, platformRole: "admin" as const, institutionRoles: [{ ...gctu, role: "reviewer" as const }] };
    expect(defaultDestination(ctx)).toEqual({ kind: "choose", areas: areasFor(ctx) });
    expect(areasFor(ctx)).toEqual(["student", "institution", "admin"]);
  });
});
