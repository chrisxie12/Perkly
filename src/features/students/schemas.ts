import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

export const LEVELS = ["100", "200", "300", "400", "500", "600", "Postgraduate", "Other"] as const;

export const studentProfileSchema = z.object({
  institutionId: z.uuid({ error: "Choose your school." }),
  campusId: z
    .union([z.uuid(), z.literal("")])
    .optional()
    .transform((value) => (value ? value : null)),
  programme: optionalText(120),
  level: z
    .union([z.enum(LEVELS), z.literal("")])
    .optional()
    .transform((value) => (value ? value : null)),
  gradYear: z
    .union([z.coerce.number().int().min(2000).max(2100), z.literal("")])
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value)),
});

/** Optional: an empty value removes the institutional email. */
export const institutionalEmailSchema = z.object({
  institutionalEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "That email address is too long.")
    .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid email address, or leave it empty."),
});

export const emailCodeSchema = z.object({
  code: z
    .string({ error: "Enter the 6-digit code." })
    .transform((value) => value.replace(/\s|-/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from the email.")),
});

export const STUDENT_ID_PATTERN = /^[A-Za-z0-9/ .-]{3,40}$/;

export const applicationSchema = z.object({
  applicationId: z.uuid(),
  studentIdNumber: z
    .string({ error: "Enter your student ID number." })
    .trim()
    .min(3, "Enter your student ID number.")
    .max(40, "That student ID looks too long.")
    .regex(STUDENT_ID_PATTERN, "Use letters, numbers, slashes, dots, spaces and hyphens only."),
  idCardPath: z.string().min(1, "Add a photo of your student ID card."),
  selfiePath: z.string().min(1, "Add a selfie."),
  includeInstitutionalEmail: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((value) => value === "on"),
});
