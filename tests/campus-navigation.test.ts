import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { areasFor, decideAccess, parseUserContext, type UserContext } from "@/lib/auth/roles";
import { allHrefs, navFor, routeAccess, type NavContext } from "@/lib/navigation/config";

const base: UserContext = {
  userId: "u",
  fullName: "Test User",
  firstName: "Test",
  signupIntent: null,
  isSuspended: false,
  platformRole: null,
  aal: "aal2",
  institutionRoles: [],
  delegatedInstitutions: [],
  merchantRoles: [],
};
const ORG = "11111111-1111-4111-8111-111111111111";
const member: UserContext = { ...base, organisationRoles: [{ organisationId: ORG, name: "GCTU SRC", role: "editor", status: "verified" }] };
const labels = (n: NavContext) => navFor("student", n).groups.flatMap((g) => g.items.map((i) => i.label));

describe("Organise area", () => {
  it("is only for organisation members", () => {
    expect(areasFor(base)).not.toContain("organise");
    expect(areasFor(member)).toContain("organise");
    expect(decideAccess("organise", base).kind).toBe("forbidden");
    expect(decideAccess("organise", member).kind).toBe("allow");
    expect(routeAccess(`/organise/${ORG}`, { ctx: base }).kind).toBe("forbidden");
    expect(routeAccess(`/organise/${ORG}`, { ctx: member }).kind).toBe("allow");
  });

  it("still blocks suspended members", () => {
    expect(decideAccess("organise", { ...member, isSuspended: true })).toEqual({ kind: "suspended" });
  });

  it("lists each organisation the person manages, and every link is a real page", () => {
    const nav = navFor("organise", { ctx: member });
    const hrefs = allHrefs(nav);
    expect(hrefs).toContain(`/organise/${ORG}`);
    const app = join(process.cwd(), "src/app");
    const exists = (href: string) => existsSync(join(app, ...href.replace(ORG, "[org]").split("/").filter(Boolean), "page.tsx"));
    expect(hrefs.filter((h) => !exists(h))).toEqual([]);
  });

  it("reads organisation roles from the context, and copes with older responses", () => {
    const raw = {
      user_id: "00000000-0000-4000-8000-000000000001",
      full_name: "Ama",
      first_name: "Ama",
      signup_intent: null,
      is_suspended: false,
      platform_role: null,
      aal: "aal1",
      institution_roles: [],
      delegated_institutions: [],
      merchant_roles: [],
    };
    expect(parseUserContext(raw, "aal1")?.organisationRoles ?? []).toEqual([]);
    const withRoles = parseUserContext(
      { ...raw, organisation_roles: [{ organisation_id: ORG, name: "GCTU SRC", role: "owner", status: "verified" }] },
      "aal1",
    );
    expect(withRoles?.organisationRoles).toEqual([{ organisationId: ORG, name: "GCTU SRC", role: "owner", status: "verified" }]);
  });
});

describe("Campus menu items", () => {
  it("show the student Campus link only when Campus is switched on", () => {
    expect(labels({ ctx: base, verification: "verified" })).not.toContain("Campus");
    expect(labels({ ctx: base, verification: "verified", campus: false })).not.toContain("Campus");
    expect(labels({ ctx: base, verification: "verified", campus: true })).toContain("Campus");
  });

  it("adds Campus as the fifth student tab only while Campus is switched on", () => {
    const off = navFor("student", { ctx: base, verification: "verified" }).tabs.map((t) => t.label);
    const on = navFor("student", { ctx: base, verification: "verified", campus: true }).tabs.map((t) => t.label);
    expect(off).toEqual(["Home", "Explore", "Scan", "My Deals"]);
    expect(on).toEqual([...off, "Campus"]);
  });

  it("limits the admin Campus pages by staff role", () => {
    const staff = (platformRole: UserContext["platformRole"]): NavContext => ({ ctx: { ...base, platformRole } });
    expect(routeAccess("/admin/campus/organisations", staff("support")).kind).toBe("forbidden");
    expect(routeAccess("/admin/campus/organisations", staff("admin")).kind).toBe("allow");
    expect(routeAccess("/admin/campus/moderation", staff("reviewer")).kind).toBe("forbidden");
    expect(routeAccess("/admin/campus/moderation", staff("support")).kind).toBe("allow");
    expect(routeAccess("/admin/campus/settings", staff("support")).kind).toBe("forbidden");
    expect(routeAccess("/admin/campus/settings", staff("admin")).kind).toBe("allow");
  });
});

describe("admin menu", () => {
  const superAdmin: UserContext = { ...base, platformRole: "super_admin" };
  it("is unchanged while Campus is off, and gains a Campus group once it's on", () => {
    const off = navFor("admin", { ctx: superAdmin }).groups.map((g) => g.label);
    expect(off).not.toContain("Campus");
    const on = navFor("admin", { ctx: superAdmin, campus: true }).groups;
    expect(on.find((g) => g.label === "Campus")?.items.map((i) => i.label)).toEqual(["Organisations", "Switches", "Moderation"]);
  });
});
