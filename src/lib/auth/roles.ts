import { z } from "zod";
import { AREA_HOME, type Area } from "./paths";

const contextSchema = z.object({
  user_id: z.uuid(),
  full_name: z.string().nullable(),
  first_name: z.string().nullable(),
  signup_intent: z.enum(["student", "merchant"]).nullable(),
  is_suspended: z.boolean(),
  platform_role: z.enum(["reviewer", "support", "admin", "super_admin"]).nullable(),
  aal: z.enum(["aal1", "aal2"]).catch("aal1"),
  institution_roles: z.array(
    z.object({
      institution_id: z.uuid(),
      short_name: z.string(),
      role: z.enum(["reviewer", "admin"]),
    }),
  ),
  delegated_institutions: z.array(z.object({ institution_id: z.uuid(), short_name: z.string() })).catch([]),
  merchant_roles: z
    .array(
      z.object({
        merchant_id: z.uuid(),
        display_name: z.string(),
        role: z.enum(["owner", "manager", "cashier"]),
        status: z.enum(["draft", "pending_review", "approved", "rejected", "suspended"]),
      }),
    )
    .catch([]),
});

export type PlatformRole = NonNullable<z.infer<typeof contextSchema>["platform_role"]>;

export interface UserContext {
  userId: string;
  fullName: string | null;
  firstName: string | null;
  signupIntent: "student" | "merchant" | null;
  isSuspended: boolean;
  platformRole: PlatformRole | null;
  aal: "aal1" | "aal2";
  institutionRoles: { institutionId: string; shortName: string; role: "reviewer" | "admin" }[];
  /** Delegated institutions a Perqly staff member may review (with two-factor). Empty for everyone else. */
  delegatedInstitutions: { institutionId: string; shortName: string }[];
  /** Businesses this person works for, and their role in each. */
  merchantRoles: MerchantMembership[];
}

export type MerchantMembership = {
  merchantId: string;
  displayName: string;
  role: "owner" | "manager" | "cashier";
  status: "draft" | "pending_review" | "approved" | "rejected" | "suspended";
};

/** Parses the result of the `get_my_context` database function. */
export function parseUserContext(raw: unknown, aalFromToken?: unknown): UserContext {
  const data = contextSchema.parse(raw);
  const aal = aalFromToken === "aal2" || aalFromToken === "aal1" ? aalFromToken : data.aal;
  return {
    userId: data.user_id,
    fullName: data.full_name,
    firstName: data.first_name,
    signupIntent: data.signup_intent,
    isSuspended: data.is_suspended,
    platformRole: data.platform_role,
    aal,
    institutionRoles: data.institution_roles.map((r) => ({ institutionId: r.institution_id, shortName: r.short_name, role: r.role })),
    delegatedInstitutions: data.delegated_institutions.map((d) => ({ institutionId: d.institution_id, shortName: d.short_name })),
    merchantRoles: data.merchant_roles.map((m) => ({
      merchantId: m.merchant_id,
      displayName: m.display_name,
      role: m.role,
      status: m.status,
    })),
  };
}

/** Areas this user may open. Every signed-in user can use the student area. */
export function areasFor(ctx: UserContext): Area[] {
  const areas: Area[] = ["student"];
  if (ctx.signupIntent === "merchant" || ctx.merchantRoles.length > 0) areas.push("merchant");
  if (ctx.institutionRoles.length > 0 || ctx.delegatedInstitutions.length > 0) areas.push("institution");
  if (ctx.platformRole) areas.push("admin");
  return areas;
}

export type AccessDecision = { kind: "allow" } | { kind: "mfa" } | { kind: "forbidden" } | { kind: "suspended" };

/**
 * Whether the user may open an area. A convenience for routing only: the
 * database enforces the same rules with RLS and in every function.
 */
export function decideAccess(area: Area, ctx: UserContext): AccessDecision {
  if (ctx.isSuspended) return { kind: "suspended" };
  switch (area) {
    case "student":
      return { kind: "allow" };
    case "merchant":
      // Anyone signed in may register a business. Owners act with two-factor; the database refuses them otherwise.
      return ctx.merchantRoles.some((m) => m.role === "owner") && ctx.aal !== "aal2" ? { kind: "mfa" } : { kind: "allow" };
    case "institution": {
      if (ctx.institutionRoles.length === 0 && ctx.delegatedInstitutions.length === 0) return { kind: "forbidden" };
      // Institution admins and Perqly staff reviewing delegated schools need two-factor;
      // the database refuses their decisions without it.
      const needsTwoFactor = ctx.institutionRoles.some((r) => r.role === "admin") || ctx.institutionRoles.length === 0;
      return needsTwoFactor && ctx.aal !== "aal2" ? { kind: "mfa" } : { kind: "allow" };
    }
    case "admin":
      if (!ctx.platformRole) return { kind: "forbidden" };
      return ctx.aal === "aal2" ? { kind: "allow" } : { kind: "mfa" };
  }
}

export type Destination = { kind: "redirect"; path: string } | { kind: "choose"; areas: Area[] };

/** Where to send a user after sign-in when they didn't ask for a specific page. */
export function defaultDestination(ctx: UserContext): Destination {
  const work = areasFor(ctx).filter((area) => area !== "student");
  if (work.length === 0) return { kind: "redirect", path: AREA_HOME.student };
  if (work.length === 1 && work[0] === "merchant") return { kind: "redirect", path: AREA_HOME.merchant };
  return { kind: "choose", areas: areasFor(ctx) };
}

/**
 * Can change platform settings (institutions, reviewers). Mirrors the database's
 * `private.is_staff('admin')`, which also needs two-factor; the admin area enforces that.
 */
export function canManagePlatform(ctx: UserContext): boolean {
  return ctx.platformRole === "admin" || ctx.platformRole === "super_admin";
}

/** Accounts that must use two-factor: platform staff and institution admins. */
export function requiresTwoFactor(ctx: UserContext): boolean {
  return (
    ctx.platformRole !== null ||
    ctx.institutionRoles.some((role) => role.role === "admin") ||
    ctx.merchantRoles.some((role) => role.role === "owner")
  );
}

/** Institutions this person administers (can manage reviewers). */
export function administeredInstitutions(ctx: UserContext) {
  return ctx.institutionRoles.filter((role) => role.role === "admin");
}
