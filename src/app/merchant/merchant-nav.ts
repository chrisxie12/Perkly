import type { MerchantMembership } from "@/lib/auth/roles";

/** The business area's menu, by role. Cashiers only see what they can use. */
export function merchantNavFor(membership: MerchantMembership | null) {
  const nav = [{ href: "/merchant", label: "Overview" }];
  if (!membership) return nav;
  if (membership.role === "owner" || membership.role === "manager") {
    nav.push(
      { href: "/merchant/offers", label: "Offers" },
      { href: "/merchant/catalogue", label: "Catalogue" },
      { href: "/merchant/branches", label: "Branches" },
      { href: "/merchant/team", label: "Team" },
      { href: "/merchant/profile", label: "Profile" },
    );
  }
  return nav;
}

export function canManage(membership: MerchantMembership | null) {
  return membership?.role === "owner" || membership?.role === "manager";
}
