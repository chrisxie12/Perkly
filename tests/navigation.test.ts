import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MerchantMembership, UserContext } from "@/lib/auth/roles";
import { activeIn, allHrefs, navFor, ROUTE_RULES, routeAccess, type NavArea, type NavContext } from "@/lib/navigation/config";

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
const ctx = (over: Partial<UserContext> = {}): UserContext => ({ ...base, ...over });
const shop = (role: MerchantMembership["role"], status: MerchantMembership["status"] = "approved"): MerchantMembership => ({
  merchantId: "m",
  displayName: "Shop",
  role,
  status,
});
const labels = (area: NavArea, n: NavContext) => navFor(area, n).tabs.map((t) => t.label);

const student: NavContext = { ctx: ctx(), verification: "verified" };
const owner: NavContext = { ctx: ctx({ merchantRoles: [shop("owner")] }), membership: shop("owner") };
const draftOwner: NavContext = { ctx: ctx(), membership: shop("owner", "draft") };
const cashier: NavContext = { ctx: ctx(), membership: shop("cashier") };
const draftCashier: NavContext = { ctx: ctx(), membership: shop("cashier", "pending_review") };
const reviewer: NavContext = { ctx: ctx({ institutionRoles: [{ institutionId: "i", shortName: "GCTU", role: "reviewer" }] }) };
const instAdmin: NavContext = { ctx: ctx({ institutionRoles: [{ institutionId: "i", shortName: "GCTU", role: "admin" }] }) };
const staff = (platformRole: UserContext["platformRole"]): NavContext => ({ ctx: ctx({ platformRole }) });

describe("menus by role", () => {
  it("gives students Home, Map, Scan, My deals and Me, with Scan as the raised middle button", () => {
    expect(labels("student", student)).toEqual(["Home", "Map", "Scan", "My deals", "Me"]);
    expect(navFor("student", student).tabs.find((t) => t.emphasis)?.key).toBe("scan");
  });

  it("marks Scan locked and Me needing attention until the student is verified", () => {
    const tabs = navFor("student", { ctx: ctx(), verification: "apply" }).tabs;
    expect(tabs.find((t) => t.key === "scan")?.badge).toBe("lock");
    expect(tabs.find((t) => t.key === "me")?.badge).toBe("dot");
    const pending = navFor("student", { ctx: ctx(), verification: "pending" }).tabs;
    expect(pending.find((t) => t.key === "me")?.badge).toBeUndefined();
    expect(navFor("student", student).tabs.every((t) => !t.badge)).toBe(true);
  });

  it("gives business managers the five business tabs, and hides live-only tabs before approval", () => {
    expect(labels("merchant", owner)).toEqual(["Overview", "Offers", "Scan", "Analytics", "Business"]);
    expect(labels("merchant", draftOwner)).toEqual(["Overview", "Offers", "Business"]);
  });

  it("gives cashiers only the counter and history", () => {
    expect(labels("merchant", cashier)).toEqual(["Overview", "Scan", "History"]);
    expect(labels("merchant", draftCashier)).toEqual(["Overview"]);
    expect(labels("merchant", { ctx: ctx(), membership: null })).toEqual(["Overview"]);
  });

  it("shows Reviewers only to institution admins", () => {
    expect(labels("institution", instAdmin)).toEqual(["Overview", "Students", "Reviews", "Reviewers", "Settings"]);
    expect(labels("institution", reviewer)).toEqual(["Overview", "Students", "Reviews", "Settings"]);
  });

  it("gives Perqly admins four tabs plus More, with every page in the sidebar", () => {
    const nav = navFor("admin", staff("super_admin"));
    expect(nav.tabs.map((t) => t.label)).toEqual(["Overview", "Merchants", "Offers", "Users"]);
    expect(nav.more.map((t) => t.label)).toEqual(["Institutions", "Staff", "Redemptions", "Reports", "Audit logs", "Settings"]);
    expect(nav.groups.map((g) => g.label)).toEqual([null, "Partners", "People", "Activity", null]);
  });

  it("puts student reviews first for admins who can verify students", () => {
    const n: NavContext = { ctx: ctx({ platformRole: "super_admin", delegatedInstitutions: [{ institutionId: "i", shortName: "GCTU" }] }) };
    const nav = navFor("admin", n);
    expect(nav.tabs.map((t) => t.label)).toEqual(["Overview", "Student reviews", "Merchants", "Offers"]);
    expect(nav.tabs[1].href).toBe("/institution/reviews");
  });

  it("gives the account pages a way back to the person's main area", () => {
    expect(labels("account", student)).toEqual(["Home", "Account", "Notifications"]);
    expect(navFor("account", owner).tabs[0]).toMatchObject({ label: "Business", href: "/merchant" });
    expect(navFor("account", staff("admin")).tabs[0]).toMatchObject({ label: "Staff", href: "/admin" });
    expect(activeIn(navFor("account", student).tabs, "/account/notifications/settings")).toBe("notifications");
  });

  it("keeps the sidebar groups for Perqly admins", () => {
    const nav = navFor("admin", staff("super_admin"));
    expect(nav.groups.map((g) => g.label)).toEqual([null, "Partners", "People", "Activity", null]);
  });

  it("hides staff-only pages from lower Perqly roles", () => {
    const sup = navFor("admin", staff("support"));
    const all = sup.groups.flatMap((g) => g.items.map((i) => i.label));
    expect(all).toContain("Users");
    expect(all).toContain("Reports");
    expect(all).not.toContain("Staff");
    expect(all).not.toContain("Audit logs");
    expect(all).not.toContain("Settings");
    const rev = navFor("admin", staff("reviewer")).groups.flatMap((g) => g.items.map((i) => i.label));
    expect(rev).toEqual(["Overview", "Institutions", "Merchants", "Offers"]);
  });

  it("never puts more than five tabs on a phone", () => {
    const cases: [NavArea, NavContext][] = [
      ["student", student],
      ["merchant", owner],
      ["merchant", cashier],
      ["institution", instAdmin],
      ["admin", staff("super_admin")],
      ["admin", staff("support")],
      ["account", student],
    ];
    for (const [area, n] of cases) {
      const nav = navFor(area, n);
      expect(nav.tabs.length + (nav.more.length > 0 ? 1 : 0)).toBeLessThanOrEqual(5);
    }
  });
});

describe("active tab", () => {
  it("highlights the parent tab on nested pages", () => {
    const s = navFor("student", student).tabs;
    expect(activeIn(s, "/student")).toBe("deals");
    expect(activeIn(s, "/student/offers/123")).toBe("deals");
    expect(activeIn(s, "/student/merchants/fresh-fade")).toBe("deals");
    expect(activeIn(s, "/student/redeem/abc")).toBe("scan");
    expect(activeIn(s, "/student/scan/code")).toBe("scan");
    expect(activeIn(s, "/student/verify")).toBe("me");
    expect(activeIn(s, "/student/profile")).toBe("me");
    expect(activeIn(s, "/student/history")).toBe("savings");
    const m = navFor("merchant", owner).tabs;
    expect(activeIn(m, "/merchant")).toBe("overview");
    expect(activeIn(m, "/merchant/catalogue")).toBe("offers");
    expect(activeIn(m, "/merchant/offers/new")).toBe("offers");
    expect(activeIn(m, "/merchant/team")).toBe("business");
    const i = navFor("institution", instAdmin).tabs;
    expect(activeIn(i, "/institution/requests/xyz")).toBe("reviews");
    expect(activeIn(i, "/institution")).toBe("overview");
    const a = navFor("admin", staff("super_admin"));
    expect(activeIn([...a.tabs, ...a.more], "/admin/merchants/abc")).toBe("merchants");
    expect(activeIn([...a.tabs, ...a.more], "/admin/audit?id=1")).toBe("audit");
  });

  it("doesn't confuse similar prefixes", () => {
    expect(activeIn(navFor("student", student).tabs, "/student/offersx")).toBeNull();
  });
});

describe("route access", () => {
  const cases: [string, NavContext, boolean][] = [
    ["/merchant/offers", cashier, false],
    ["/merchant/offers/new", owner, true],
    ["/merchant/catalogue", cashier, false],
    ["/merchant/counter", cashier, true],
    ["/merchant/counter", draftCashier, false],
    ["/merchant/redemptions", draftOwner, false],
    ["/merchant/analytics", owner, true],
    ["/merchant/analytics", cashier, false],
    ["/merchant/analytics", draftOwner, false],
    ["/merchant/codes", draftOwner, false],
    ["/merchant/business", cashier, false],
    ["/merchant/team", cashier, false],
    ["/merchant/agreement", draftOwner, true],
    ["/merchant", cashier, true],
    ["/institution/reviewers", reviewer, false],
    ["/institution/reviewers", instAdmin, true],
    ["/institution/students", reviewer, true],
    ["/admin/users", staff("reviewer"), false],
    ["/admin/users", staff("support"), true],
    ["/admin/reports", staff("support"), true],
    ["/admin/staff", staff("support"), false],
    ["/admin/staff", staff("admin"), true],
    ["/admin/audit", staff("support"), false],
    ["/admin/settings", staff("admin"), true],
    ["/admin/institutions/new", staff("support"), false],
    ["/admin/institutions/123", staff("support"), true],
    ["/admin/redemptions?ref=PQ-1", staff("reviewer"), false],
    ["/admin/audit/", staff("support"), false],
  ];
  it.each(cases)("%s", (path, n, allowed) => {
    expect(routeAccess(path, n).kind).toBe(allowed ? "allow" : "forbidden");
  });

  it("explains a refusal", () => {
    const d = routeAccess("/merchant/analytics", cashier);
    expect(d.kind === "forbidden" && d.reason).toMatch(/owners and managers/);
  });
});

// Filesystem checks -----------------------------------------------------------------
const APP = join(process.cwd(), "src/app");

function pageExists(href: string) {
  return existsSync(join(APP, ...href.split("/").filter(Boolean), "page.tsx"));
}

function pagesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...pagesUnder(full));
    else if (name === "page.tsx") out.push(full);
  }
  return out;
}

describe("every destination is a real page", () => {
  it("has a page for every menu link of every role", () => {
    const everyone: [NavArea, NavContext][] = [
      ["student", student],
      ["student", { ctx: ctx(), verification: "apply" }],
      ["merchant", owner],
      ["merchant", cashier],
      ["institution", instAdmin],
      ["admin", staff("super_admin")],
      ["account", student],
    ];
    const missing = everyone.flatMap(([area, n]) => allHrefs(navFor(area, n))).filter((href) => !pageExists(href));
    expect(missing).toEqual([]);
  });

  it("has a page or folder for every access rule", () => {
    const missing = ROUTE_RULES.map((r) => r.path.replace(/\*$/, "")).filter(
      (p) => !existsSync(join(APP, ...p.split("/").filter(Boolean))),
    );
    expect(missing).toEqual([]);
  });

  it("renders every area page inside AreaShell, so the access check runs", () => {
    const pages = ["student", "merchant", "institution", "admin", "account"].flatMap((a) => pagesUnder(join(APP, a)));
    const without = pages.filter((p) => !readFileSync(p, "utf8").includes("<AreaShell area="));
    expect(without).toEqual([]);
  });
});
