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
}

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
  };
}

/** Areas this user may open. Every signed-in user can use the student area. */
export function areasFor(ctx: UserContext): Area[] {
  const areas: Area[] = ["student"];
  if (ctx.signupIntent === "merchant") areas.push("merchant");
  if (ctx.institutionRoles.length > 0) areas.push("institution");
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
    case "merchant":
      // Merchant registration opens in roadmap step 1.4; any signed-in user may start it.
      return { kind: "allow" };
    case "institution": {
      if (ctx.institutionRoles.length === 0) return { kind: "forbidden" };
      const isAdmin = ctx.institutionRoles.some((r) => r.role === "admin");
      return isAdmin && ctx.aal !== "aal2" ? { kind: "mfa" } : { kind: "allow" };
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
