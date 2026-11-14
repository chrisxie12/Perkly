import { administeredInstitutions, type UserContext } from "@/lib/auth/roles";

/** The review area's menu. "Reviewers" appears only for institution admins. */
export function institutionNavFor(ctx: UserContext | null) {
  const nav = [
    { href: "/institution", label: "Queue" },
    { href: "/institution/activity", label: "Decisions" },
  ];
  if (ctx && administeredInstitutions(ctx).length > 0) nav.push({ href: "/institution/reviewers", label: "Reviewers" });
  return nav;
}
