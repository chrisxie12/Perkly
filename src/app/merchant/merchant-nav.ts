import type { MerchantMembership } from "@/lib/auth/roles";

/** The business area's menu, by role. Cashiers only see what they can use. */
export function merchantNavFor(membership: MerchantMembership | null) {
  const nav = [{ href: "/merchant", label: "Overview" }];
  if (!membership) return nav;
  if (membership.role === "owner" || membership.role === "manager") {
    nav.push(
      { href: "/merchant/profile", label: "Profile" },
      { href: "/merchant/branches", label: "Branches" },
      { href: "/merchant/team", label: "Team" },
    );
  }
  return nav;
}

export function canManage(membership: MerchantMembership | null) {
  return membership?.role === "owner" || membership?.role === "manager";
}
