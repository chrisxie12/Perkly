import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { friendsErrorMessage, REPORT_REASONS, reportSchema, searchSchema, shareSchema } from "@/features/friends/schemas";
import { ROUTE_RULES } from "@/lib/navigation/config";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261120090000_friends.sql"), "utf8");
const id = "3f2c1b8e-1d2a-4c5b-9e7f-0a1b2c3d4e5f";

describe("friends forms", () => {
  it("needs two letters to search", () => {
    expect(searchSchema.safeParse({ q: "a" }).success).toBe(false);
    expect(searchSchema.safeParse({ q: "Ama" }).success).toBe(true);
  });

  it("keeps a shared note short", () => {
    expect(shareSchema.safeParse({ friendId: id, offerId: id, note: "x".repeat(141) }).success).toBe(false);
    expect(shareSchema.safeParse({ friendId: id, offerId: id }).success).toBe(true);
  });

  it("only accepts the report reasons the database accepts", () => {
    for (const r of REPORT_REASONS) expect(migration).toContain(`'${r.value}'`);
    expect(reportSchema.safeParse({ userId: id, reason: "rude" }).success).toBe(false);
    expect(reportSchema.safeParse({ userId: id, reason: "spam" }).success).toBe(true);
  });

  it("turns database errors into plain words", () => {
    expect(friendsErrorMessage("not_friends")).toMatch(/friends/);
    expect(friendsErrorMessage("whatever")).toMatch(/Something went wrong/);
  });
});

describe("friends privacy", () => {
  it("keeps both settings off by default", () => {
    expect(migration).toMatch(/findable boolean not null default false/);
    expect(migration).toMatch(/share_activity boolean not null default false/);
  });

  it("only lets verified students open Friends", () => {
    const rule = ROUTE_RULES.find((r) => r.path === "/student/friends*");
    expect(rule).toBeDefined();
    const ctx = {} as never;
    expect(rule!.allow({ ctx, verification: "verified" })).toBe(true);
    expect(rule!.allow({ ctx, verification: "pending" })).toBe(false);
    expect(rule!.allow({ ctx })).toBe(false);
  });

  it("never sends ID photos, selfies or emails in search results", () => {
    const search = migration.slice(migration.indexOf("create function public.search_classmates"), migration.indexOf("-- Requests"));
    expect(search).not.toMatch(/photo|selfie|email/i);
  });

  it("has the pages it links to", () => {
    for (const p of ["student/friends", "student/friends/chat/[id]", "student/friends/report/[id]", "admin/student-reports/[id]"])
      expect(existsSync(join(process.cwd(), "src/app", p, "page.tsx"))).toBe(true);
  });
});
