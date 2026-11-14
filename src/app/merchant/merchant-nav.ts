import type { MerchantMembership } from "@/lib/auth/roles";

/** Owners and managers run the business; cashiers use the counter. Menus come from src/lib/navigation/config.ts. */
export function canManage(membership: MerchantMembership | null) {
  return membership?.role === "owner" || membership?.role === "manager";
}
