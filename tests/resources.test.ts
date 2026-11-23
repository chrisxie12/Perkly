import { describe, expect, it } from "vitest";
import {
  formatCheckedOn,
  offerLabel,
  parseResources,
  recentlyAdded,
  requirementLines,
  resourceFormSchema,
  slugify,
  type Resource,
} from "@/features/resources/model";

const base: Resource = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "sample",
  name: "Sample",
  provider: "Provider",
  category: "developer_tools",
  offer_type: "free_for_students",
  offer_label: null,
  summary: "A sample resource summary.",
  description: null,
  benefits: [],
  requirements_note: null,
  eligibility: "needs_verification",
  availability: "international",
  needs_school_email: false,
  needs_student_proof: false,
  needs_institution_listed: false,
  needs_payment_card: false,
  min_age: null,
  official_url: "https://example.com",
  source_url: null,
  checked_on: null,
  featured: false,
  status: "published",
  published_at: "2026-11-20T10:00:00Z",
  updated_at: "2026-11-20T10:00:00Z",
  logo_path: null,
  cover_path: null,
};

const form = {
  id: null,
  name: "Sample",
  slug: "sample",
  provider: "Provider",
  category: "developer_tools",
  offerType: "free_forever",
  offerLabel: "",
  summary: "A sample resource summary.",
  description: "",
  benefits: "One\n\n  Two  \n",
  requirementsNote: "",
  eligibility: "needs_verification",
  availability: "international",
  needsSchoolEmail: false,
  needsStudentProof: false,
  needsInstitutionListed: false,
  needsPaymentCard: false,
  minAge: "",
  officialUrl: "https://example.com",
  sourceUrl: "",
  checkedOn: "",
};

describe("student resources", () => {
  it("shows the admin's label, else the offer type", () => {
    expect(offerLabel(base)).toBe("Free for students");
    expect(offerLabel({ ...base, offer_label: "$100 Azure credit" })).toBe("$100 Azure credit");
    expect(offerLabel({ ...base, offer_type: "paid_exam" })).toBe("Paid exam");
  });

  it("spells out what a student needs", () => {
    expect(requirementLines(base)).toEqual(["No school email needed"]);
    const all = requirementLines({
      ...base,
      needs_school_email: true,
      needs_student_proof: true,
      needs_institution_listed: true,
      needs_payment_card: true,
      min_age: 18,
    });
    expect(all).toEqual([
      "A school email address",
      "Proof that you're a student (for example, a student ID or enrolment letter)",
      "Your school must be recognised by the provider",
      "A payment card or payment method",
      "Aged 18 or older",
    ]);
  });

  it("formats checked dates without time zones", () => {
    expect(formatCheckedOn("2026-11-23")).toBe("23 November 2026");
    expect(formatCheckedOn(null)).toBeNull();
    expect(formatCheckedOn("soon")).toBeNull();
  });

  it("orders recently added newest first", () => {
    const a = { ...base, id: "a", published_at: "2026-11-01T00:00:00Z" };
    const b = { ...base, id: "b", published_at: "2026-11-22T00:00:00Z" };
    expect(recentlyAdded([a, b]).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("drops malformed rows from the database", () => {
    expect(parseResources([base, { nope: true }])).toHaveLength(1);
    expect(parseResources(null)).toEqual([]);
  });

  it("makes clean web addresses", () => {
    expect(slugify("Figma for Éducation!")).toBe("figma-for-education");
    expect(slugify("  AWS -- Educate  ")).toBe("aws-educate");
  });

  it("validates the admin form", () => {
    const ok = resourceFormSchema.safeParse(form);
    expect(ok.success && ok.data.benefits).toEqual(["One", "Two"]);
    expect(resourceFormSchema.safeParse({ ...form, officialUrl: "http://example.com" }).success).toBe(false);
    expect(resourceFormSchema.safeParse({ ...form, eligibility: "confirmed" }).success).toBe(false);
    expect(resourceFormSchema.safeParse({ ...form, eligibility: "confirmed", checkedOn: "2026-11-23" }).success).toBe(true);
    expect(resourceFormSchema.safeParse({ ...form, slug: "Bad Slug" }).success).toBe(false);
  });
});

describe("resourceImageUrl", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  it("builds the public storage URL for a valid path", async () => {
    const { resourceImageUrl } = await import("@/features/resources/model");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co/";
    expect(resourceImageUrl(`${id}/${id}.webp`)).toBe(`https://abc.supabase.co/storage/v1/object/public/resource-images/${id}/${id}.webp`);
  });
  it("refuses missing or odd paths", async () => {
    const { resourceImageUrl } = await import("@/features/resources/model");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    expect(resourceImageUrl(null)).toBeNull();
    expect(resourceImageUrl("../secret.png")).toBeNull();
    expect(resourceImageUrl(`${id}/${id}.gif`)).toBeNull();
    expect(resourceImageUrl(`https://evil.example/${id}.png`)).toBeNull();
  });
});
