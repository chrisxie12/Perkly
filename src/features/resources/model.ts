import { z } from "zod";

/**
 * Student Resources: an admin-managed directory of free tools, student plans, learning,
 * certifications and opportunities (supabase/migrations/20261124120000_student_resources.sql).
 * Perqly is not affiliated with any provider listed.
 */

export const CATEGORIES = [
  { value: "ai_productivity", label: "AI and Productivity", short: "AI & productivity" },
  { value: "developer_tools", label: "Developer Tools and Software", short: "Developer tools" },
  { value: "learning_certifications", label: "Learning and Free Certifications", short: "Learning" },
  { value: "career_internships", label: "Career Opportunities and Internships", short: "Careers" },
  { value: "design_creativity", label: "Design and Creativity", short: "Design" },
  { value: "business_entrepreneurship", label: "Business and Entrepreneurship", short: "Business" },
  { value: "finance_student_services", label: "Finance and Student Services", short: "Finance" },
  { value: "entertainment_lifestyle", label: "Entertainment and Lifestyle", short: "Lifestyle" },
  { value: "discounts_trials", label: "Student Discounts and Trials", short: "Discounts & trials" },
] as const;
export type Category = (typeof CATEGORIES)[number]["value"];
const categoryValues = CATEGORIES.map((c) => c.value) as [Category, ...Category[]];

export const OFFER_TYPES = {
  free_forever: { label: "Free", tone: "bg-emerald-50 text-emerald-800" },
  free_for_students: { label: "Free for students", tone: "bg-blue-50 text-blue-700" },
  free_trial: { label: "Free trial", tone: "bg-violet-50 text-violet-800" },
  discounted: { label: "Student discount", tone: "bg-orange-50 text-orange-800" },
  paid_exam: { label: "Paid exam", tone: "bg-ink-100 text-ink-800" },
  funded: { label: "Funded", tone: "bg-emerald-50 text-emerald-800" },
  loan: { label: "Loan", tone: "bg-ink-100 text-ink-800" },
} as const;
export type OfferType = keyof typeof OFFER_TYPES;
const offerValues = Object.keys(OFFER_TYPES) as [OfferType, ...OfferType[]];

export const AVAILABILITY = {
  ghana: "Available in Ghana",
  international: "Open internationally",
  needs_verification: "Availability in Ghana not confirmed",
} as const;
export type Availability = keyof typeof AVAILABILITY;

export const STATUSES = ["pending", "draft", "published", "archived"] as const;
export type ResourceStatus = (typeof STATUSES)[number];

/** Student-facing filters (match public.list_student_resources). */
export const FILTERS = [
  { value: "confirmed", label: "Eligibility checked" },
  { value: "no_school_email", label: "No school email needed" },
  { value: "ghana", label: "Available in Ghana" },
] as const;
export type ResourceFilter = (typeof FILTERS)[number]["value"];

export const resourceSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  provider: z.string(),
  category: z.enum(categoryValues),
  offer_type: z.enum(offerValues),
  offer_label: z.string().nullable(),
  summary: z.string(),
  description: z.string().nullable(),
  benefits: z.array(z.string()).catch([]),
  requirements_note: z.string().nullable(),
  eligibility: z.enum(["confirmed", "needs_verification"]),
  availability: z.enum(["ghana", "international", "needs_verification"]),
  needs_school_email: z.boolean(),
  needs_student_proof: z.boolean(),
  needs_institution_listed: z.boolean(),
  needs_payment_card: z.boolean(),
  min_age: z.number().nullable(),
  official_url: z.string(),
  source_url: z.string().nullable(),
  checked_on: z.string().nullable(),
  featured: z.boolean(),
  status: z.enum(STATUSES),
  published_at: z.string().nullable(),
  updated_at: z.string(),
});
export type Resource = z.infer<typeof resourceSchema>;

/** Parses an RPC result, dropping anything malformed rather than failing the page. */
export function parseResources(data: unknown): Resource[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    const parsed = resourceSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.value === c)?.label ?? c;
export const categoryShort = (c: Category) => CATEGORIES.find((x) => x.value === c)?.short ?? c;
export const isCategory = (v: unknown): v is Category => categoryValues.includes(v as Category);
export const isFilter = (v: unknown): v is ResourceFilter => FILTERS.some((f) => f.value === v);

/** The headline pill: the admin's own label when set, else the offer type. */
export function offerLabel(r: Pick<Resource, "offer_type" | "offer_label">) {
  return r.offer_label ?? OFFER_TYPES[r.offer_type].label;
}

/** "23 November 2026" for an ISO date (YYYY-MM-DD), without time-zone surprises. */
export function formatCheckedOn(iso: string | null) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d} ${months[m - 1]} ${y}`;
}

/** What a student needs, as plain lines, from the requirement flags. */
export function requirementLines(
  r: Pick<Resource, "needs_school_email" | "needs_student_proof" | "needs_institution_listed" | "needs_payment_card" | "min_age">,
) {
  const lines: string[] = [];
  lines.push(r.needs_school_email ? "A school email address" : "No school email needed");
  if (r.needs_student_proof) lines.push("Proof that you're a student (for example, a student ID or enrolment letter)");
  if (r.needs_institution_listed) lines.push("Your school must be recognised by the provider");
  if (r.needs_payment_card) lines.push("A payment card or payment method");
  if (r.min_age) lines.push(`Aged ${r.min_age} or older`);
  return lines;
}

/** Newest first by publish date, for "Recently added". */
export function recentlyAdded(list: Resource[], count = 5) {
  return [...list]
    .filter((r) => r.published_at)
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, count);
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((v) => (v === "" ? null : v));
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^https:\/\/\S+$/, "Use a full https:// link.");

/** The admin form, validated before it reaches admin_save_student_resource. */
export const resourceFormSchema = z
  .object({
    id: z.string().uuid().nullable(),
    name: z.string().trim().min(2, "Enter a name.").max(120),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.")
      .min(2)
      .max(60),
    provider: z.string().trim().min(2, "Enter the provider.").max(80),
    category: z.enum(categoryValues, { error: "Choose a category." }),
    offerType: z.enum(offerValues, { error: "Choose the offer type." }),
    offerLabel: optionalText(40),
    summary: z.string().trim().min(10, "Write a one-line summary (10 characters or more).").max(200),
    description: optionalText(2000),
    benefits: z
      .string()
      .transform((v) =>
        v
          .split("\n")
          .map((b) => b.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().min(2).max(160, "Keep each benefit to one short line.")).max(8, "List 8 benefits or fewer.")),
    requirementsNote: optionalText(600),
    eligibility: z.enum(["confirmed", "needs_verification"]),
    availability: z.enum(["ghana", "international", "needs_verification"]),
    needsSchoolEmail: z.boolean(),
    needsStudentProof: z.boolean(),
    needsInstitutionListed: z.boolean(),
    needsPaymentCard: z.boolean(),
    minAge: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .pipe(z.number().int().min(10).max(99).nullable()),
    officialUrl: httpsUrl,
    sourceUrl: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .pipe(httpsUrl.nullable()),
    checkedOn: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .pipe(
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
      ),
  })
  .refine((v) => v.eligibility !== "confirmed" || v.checkedOn !== null, {
    path: ["checkedOn"],
    message: "Add the date you checked eligibility, or mark it as needing verification.",
  });

export function resourceErrorMessage(code: string | undefined) {
  switch (code) {
    case "forbidden":
      return "Only Perqly admins with two-factor sign-in can manage resources.";
    case "slug_taken":
      return "Another resource already uses that web address. Change the short name.";
    case "checked_on_required":
      return "Add the date you checked eligibility, or mark it as needing verification.";
    case "checked_on_future":
      return "The checked date can't be in the future.";
    case "not_published":
      return "Publish the resource before featuring it.";
    case "resource_not_found":
      return "That resource no longer exists. Reload the page.";
    default:
      return "Something went wrong. Reload the page and try again.";
  }
}
