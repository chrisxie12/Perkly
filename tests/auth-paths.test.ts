import { describe, expect, it } from "vitest";
import { areaOfPath, isAuthPage, isPrivatePath, loginPath, safeNextPath } from "@/lib/auth/paths";

describe("safeNextPath", () => {
  it.each(["/student", "/merchant/offers?tab=active", "/admin#queue", "/r/AbCdEfGhIjKlMnOpQrStUv"])("accepts same-site path %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    ["absolute URL", "https://evil.example/steal"],
    ["protocol-relative URL", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["javascript URL", "javascript:alert(1)"],
    ["control character", "/student\n/admin"],
    ["empty", ""],
    ["non-string", 42],
    ["sign-in page (loop)", "/login?next=/student"],
    ["auth callback (loop)", "/auth/continue"],
    ["too long", `/${"a".repeat(600)}`],
  ])("rejects %s", (_label, value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it("normalises dot segments without leaving the site", () => {
    expect(safeNextPath("/student/../admin")).toBe("/admin");
  });
});

describe("path helpers", () => {
  it("recognises private areas and the QR link", () => {
    expect(isPrivatePath("/student")).toBe(true);
    expect(isPrivatePath("/admin/merchants")).toBe(true);
    expect(isPrivatePath("/r/abc")).toBe(true);
    expect(isPrivatePath("/")).toBe(false);
    expect(isPrivatePath("/register")).toBe(false);
    expect(isPrivatePath("/students-guide")).toBe(false);
  });

  it("recognises sign-in pages", () => {
    expect(isAuthPage("/login")).toBe(true);
    expect(isAuthPage("/login/code")).toBe(true);
    expect(isAuthPage("/register")).toBe(true);
    expect(isAuthPage("/loginx")).toBe(false);
  });

  it("finds the area of a path", () => {
    expect(areaOfPath("/institution/requests/1")).toBe("institution");
    expect(areaOfPath("/install")).toBeNull();
  });

  it("builds a sign-in link that keeps only safe destinations", () => {
    expect(loginPath("/student")).toBe("/login?next=%2Fstudent");
    expect(loginPath("https://evil.example")).toBe("/login");
  });
});
