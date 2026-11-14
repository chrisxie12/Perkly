import { AREA_HOME, AREA_LABEL } from "@/lib/auth/paths";
import { areasFor, type UserContext } from "@/lib/auth/roles";

export function accountNavFor(ctx: UserContext) {
  return [
    { href: "/account", label: "Account" },
    { href: "/account/notifications", label: "Notifications" },
    ...areasFor(ctx).map((area) => ({ href: AREA_HOME[area], label: AREA_LABEL[area] })),
  ];
}
