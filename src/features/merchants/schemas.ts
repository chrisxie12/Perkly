import { z } from "zod";

const optional = (schema: z.ZodString) => schema.optional();

export const phoneSchema = z
  .string()
  .transform((value) => value.replace(/[^\d+ ]/g, "").trim())
  .pipe(z.string().regex(/^\+?[0-9 ]{9,16}$/, "Enter a phone number like 024 123 4567."));

export const registerMerchantSchema = z.object({
  displayName: z
    .string({ error: "Enter your business name." })
    .trim()
    .min(2, "Enter your business name.")
    .max(80, "Keep it under 80 characters."),
  categoryId: z.uuid({ error: "Choose a category." }),
  phone: phoneSchema.optional(),
  email: z.email({ error: "Enter a valid email address." }).max(254).optional(),
  description: optional(z.string().max(2000, "Keep the description under 2,000 characters.")),
});

export const merchantProfileSchema = registerMerchantSchema.extend({
  merchantId: z.uuid(),
  legalName: optional(z.string().min(2, "Enter the registered name.").max(160)),
  website: optional(z.string().regex(/^https:\/\/\S{4,200}$/, "Use a full https:// address.")),
});

export const branchSchema = z
  .object({
    merchantId: z.uuid(),
    branchId: z.uuid().optional(),
    name: z.string({ error: "Name the branch." }).trim().min(2, "Name the branch, for example Tesano.").max(120),
    addressLine: optional(z.string().max(200)),
    area: optional(z.string().max(80)),
    city: optional(z.string().max(80)),
    digitalAddress: optional(
      z
        .string()
        .toUpperCase()
        .regex(/^[A-Z]{2}-?[0-9]{3,4}-?[0-9]{3,4}$/, "Use a GhanaPost address like GA-123-4567."),
    ),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    phone: phoneSchema.optional(),
    openingHours: optional(z.string().max(200)),
    isActive: z.enum(["true", "false"]).default("true"),
  })
  .superRefine((value, ctx) => {
    if ((value.latitude === undefined) !== (value.longitude === undefined)) {
      ctx.addIssue({ code: "custom", path: ["longitude"], message: "Give both latitude and longitude, or neither." });
    }
  });

export const teamMemberSchema = z
  .object({
    merchantId: z.uuid(),
    email: z.email({ error: "Enter the email they use for Perqly." }).max(254).toLowerCase(),
    role: z.enum(["manager", "cashier"], { error: "Choose a role." }),
    branchIds: z.array(z.uuid()).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.role === "cashier" && value.branchIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["branchIds"], message: "Choose at least one branch this cashier works at." });
    }
  });

export const merchantDecisionSchema = z
  .object({
    merchantId: z.uuid(),
    decision: z.enum(["approve", "reject", "suspend", "reinstate"]),
    reason: optional(z.string().max(500)),
  })
  .superRefine((value, ctx) => {
    if ((value.decision === "reject" || value.decision === "suspend") && (!value.reason || value.reason.length < 5)) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Give the business a reason they can act on." });
    }
  });

export const MERCHANT_STATUS_LABEL: Record<string, string> = {
  draft: "Setting up",
  pending_review: "In review",
  approved: "Live",
  rejected: "Changes needed",
  suspended: "Suspended",
};

export function merchantErrorMessage(code: string | undefined): string {
  switch (code) {
    case "forbidden":
      return "You don't have permission to do that. Business owners need two-step verification.";
    case "account_suspended":
      return "Your account is suspended. Contact Perqly support.";
    case "too_many_merchants":
      return "You can own up to 3 businesses on Perqly.";
    case "category_invalid":
      return "Choose a category.";
    case "merchant_suspended":
      return "This business is suspended, so it can't be changed. Contact Perqly support.";
    case "merchant_not_editable":
      return "This business is already in review or live.";
    case "branch_required":
      return "Add at least one branch first.";
    case "agreement_required":
      return "The owner must sign the student discount agreement first.";
    case "branch_name_invalid":
      return "Name the branch, for example Tesano.";
    case "branch_name_in_use":
      return "You already have a branch with that name.";
    case "branch_not_found":
      return "That branch no longer exists.";
    case "branch_invalid":
      return "Check the branch details.";
    case "digital_address_invalid":
      return "Use a GhanaPost address like GA-123-4567.";
    case "location_invalid":
      return "Give both latitude and longitude, or neither.";
    case "user_not_found":
      return "No Perqly account uses that email. Ask them to sign up first, then try again.";
    case "already_owner":
      return "That person already owns this business.";
    case "member_not_found":
      return "That person is no longer on the team.";
    case "reason_required":
      return "Give the business a reason they can act on.";
    case "invalid_transition":
      return "That decision doesn't apply to this business's current status.";
    case "rate_limited":
      return "Too many attempts. Wait a while, then try again.";
    default:
      return "Something went wrong. Try again in a moment.";
  }
}
