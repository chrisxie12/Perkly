import { z } from "zod";

const optionalText = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

export function readForm(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, optionalText(formData.get(key))]));
}

export const institutionSchema = z
  .object({
    slug: z
      .string({ error: "Add a short web name." })
      .toLowerCase()
      .regex(/^[a-z0-9-]{2,64}$/, "Use 2 to 64 lowercase letters, numbers and hyphens, like gctu or ug-legon."),
    name: z.string({ error: "Add the full name." }).min(3, "Add the full name.").max(160, "Keep the name under 160 characters."),
    shortName: z
      .string({ error: "Add a short name." })
      .min(2, "Use at least 2 characters.")
      .max(20, "Keep the short name under 20 characters."),
    status: z.enum(["inactive", "pilot", "active"], { error: "Choose a status." }),
    reviewMode: z.enum(["institution", "delegated"], { error: "Choose who reviews students." }),
    delegatedAt: z.iso.date({ error: "Enter the date the agreement was signed." }).optional(),
    yearEndMonth: z.coerce.number().int().min(1).max(12).optional(),
    yearEndDay: z.coerce.number().int().min(1).max(31).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.reviewMode === "delegated" && !value.delegatedAt) {
      ctx.addIssue({ code: "custom", path: ["delegatedAt"], message: "Perqly can only review with a signed agreement. Enter its date." });
    }
    if ((value.yearEndMonth === undefined) !== (value.yearEndDay === undefined)) {
      ctx.addIssue({ code: "custom", path: ["yearEndDay"], message: "Give both the month and the day, or neither." });
    }
  });

export const domainSchema = z.object({
  institutionId: z.uuid(),
  domain: z
    .string({ error: "Add a domain." })
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, "Enter a domain like st.gctu.edu.gh, without @."),
});

export const campusSchema = z
  .object({
    institutionId: z.uuid(),
    campusId: z.uuid().optional(),
    name: z.string({ error: "Add the campus name." }).min(2, "Add the campus name.").max(120, "Keep the name under 120 characters."),
    digitalAddress: z
      .string()
      .toUpperCase()
      .regex(/^[A-Z]{2}-?[0-9]{3,4}-?[0-9]{3,4}$/, "Use a GhanaPost address like GA-123-4567.")
      .optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.latitude === undefined) !== (value.longitude === undefined)) {
      ctx.addIssue({ code: "custom", path: ["longitude"], message: "Give both latitude and longitude, or neither." });
    }
  });

export const appointSchema = z.object({
  institutionId: z.uuid(),
  email: z.email({ error: "Enter the person's email address." }).max(254).toLowerCase(),
  role: z.enum(["reviewer", "admin"], { error: "Choose a role." }),
});

export function adminErrorMessage(code: string | undefined): string {
  switch (code) {
    case "forbidden":
      return "Only Perqly admins signed in with two-factor can do that.";
    case "institution_not_found":
      return "That institution no longer exists.";
    case "domain_invalid":
      return "Enter a domain like st.gctu.edu.gh, without @.";
    case "domain_in_use":
      return "Another institution already uses that domain.";
    case "campus_name_invalid":
      return "Add the campus name.";
    case "campus_name_in_use":
      return "This institution already has a campus with that name.";
    case "campus_not_found":
      return "That campus no longer exists.";
    case "digital_address_invalid":
      return "Use a GhanaPost address like GA-123-4567.";
    case "location_invalid":
      return "Give both latitude and longitude, or neither.";
    case "user_not_found":
      return "No Perqly account uses that email. Ask the person to sign up first, then try again.";
    case "reviewer_not_found":
      return "That reviewer was already removed.";
    case "accreditation_unconfirmed":
      return "Record the GTEC accreditation check as confirmed (in Directory details) before showing this institution to students.";
    case "directory_invalid":
      return "Check the website (it must start with https://) and the other details.";
    case "campus_details_invalid":
      return "Check the campus details. Links must start with https://.";
    case "logo_source_required":
      return "Add the page on the institution's official website where this logo came from.";
    case "logo_missing":
    case "path_invalid":
      return "The logo didn't upload. Try again.";
    case "request_not_found":
      return "That request was already handled.";
    default:
      return "Something went wrong. Try again in a moment.";
  }
}

const trimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || /^https:\/\//.test(v), "Use a full link starting with https://");

export const directorySchema = z.object({
  institutionId: z.uuid(),
  institutionType: z.enum(["public", "private", ""]).optional(),
  officialWebsite: httpsUrl,
  city: trimmedText(60),
  region: trimmedText(60),
  infoSourceUrl: httpsUrl,
  accreditationStatus: z.enum(["unverified", "confirmed", "not_found", "closed"]),
  accreditationNote: trimmedText(300),
});

export const campusDetailsSchema = z.object({
  institutionId: z.uuid(),
  campusId: z.uuid(),
  campusType: z.enum(["main", "satellite", "city", "learning_centre"]),
  address: trimmedText(200),
  city: trimmedText(60),
  region: trimmedText(60),
  sourceUrl: httpsUrl,
  infoStatus: z.enum(["confirmed", "unverified"]),
});
