import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGAL_CONTACT_EMAIL, LEGAL_PAGES_ARE_DRAFTS, OPERATOR_NAME, TERMS_VERSION } from "@/config/legal";

const page = (name: string) => readFileSync(`src/app/(marketing)/${name}/page.tsx`, "utf8");

describe("legal pages", () => {
  it("stay drafts until operator, DPC registration and legal review are done", () => {
    expect(TERMS_VERSION).toMatch(/^[A-Za-z0-9.-]{1,40}$/);
    expect(LEGAL_PAGES_ARE_DRAFTS).toBe(true);
    for (const name of ["terms", "privacy"]) expect(page(name)).toContain("DraftLegalPage");
  });

  it("never present Vision 61 Studios as the operator", () => {
    expect(OPERATOR_NAME).not.toMatch(/vision\s*61/i);
    for (const name of ["terms", "privacy"]) expect(page(name)).not.toMatch(/Vision\s*61/i);
  });

  it("give a contact address", () => {
    expect(LEGAL_CONTACT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/);
  });
});
