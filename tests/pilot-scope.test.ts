import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { navFor, routeAccess, type NavContext } from "@/lib/navigation/config";
import type { UserContext } from "@/lib/auth/roles";

const ctx: UserContext = {
  userId: "u",
  fullName: "Ama Mensah",
  firstName: "Ama",
  signupIntent: null,
  isSuspended: false,
  platformRole: null,
  aal: "aal1",
  institutionRoles: [],
  delegatedInstitutions: [],
  merchantRoles: [],
};
const student: NavContext = { ctx, verification: "verified" };
const links = (n: NavContext) => navFor("student", n).groups.flatMap((g) => g.items.map((i) => i.href));

describe("pilot scope", () => {
  it("hides Friends, Bookings and Campus from students while they're switched off", () => {
    expect(links(student)).not.toContain("/student/friends");
    expect(links(student)).not.toContain("/student/bookings");
    expect(links(student)).not.toContain("/student/campus");
    expect(links(student)).toContain("/student/messages");
    expect(routeAccess("/student/friends/chat/x", student).kind).toBe("forbidden");
    expect(routeAccess("/student/bookings", student).kind).toBe("forbidden");
  });
  it("brings each back when switched on", () => {
    const all = { ...student, friends: true, bookings: true, campus: true };
    expect(links(all)).toEqual(expect.arrayContaining(["/student/friends", "/student/bookings", "/student/campus"]));
    expect(routeAccess("/student/friends", all).kind).toBe("allow");
    expect(routeAccess("/student/bookings", all).kind).toBe("allow");
  });
  it("starts switched off in the database", () => {
    const sql = readFileSync("supabase/migrations/20261122210000_pilot_switches.sql", "utf8");
    expect(sql).toContain("('pilot.friends_enabled', '0')");
    expect(sql).toContain("('pilot.bookings_enabled', '0')");
  });
  it("no longer says Perqly collects nothing", () => {
    const page = readFileSync("src/app/(marketing)/privacy/page.tsx", "utf8");
    expect(page).not.toContain("does not collect any personal information");
    expect(page).toContain("deleted 30");
  });
});
